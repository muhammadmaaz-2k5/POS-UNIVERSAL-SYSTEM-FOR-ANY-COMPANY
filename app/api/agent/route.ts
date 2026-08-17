import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || '',
  baseURL: 'https://api.groq.com/openai/v1',
});

const MODEL = 'groq/compound';

// ─── Supabase tool functions ──────────────────────────────────────────────────

async function getLowStockProducts(supabase: any, companyId: string) {
  const { data } = await supabase
    .from('products')
    .select('name, sku, stock_quantity, low_stock_threshold, price')
    .eq('company_id', companyId)
    .eq('is_active', true);
  return (data || []).filter(
    (p: any) => Number(p.stock_quantity) <= Number(p.low_stock_threshold)
  );
}

async function getSalesSummary(
  supabase: any,
  companyId: string,
  period: 'today' | 'week' | 'month' | 'year'
) {
  const now = new Date();
  let fromDate: Date;
  if (period === 'today') fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  else if (period === 'week') fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  else if (period === 'month') fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
  else fromDate = new Date(now.getFullYear(), 0, 1);

  const { data } = await supabase
    .from('sales')
    .select('total, subtotal, tax_amount, discount, payment_method, status')
    .eq('company_id', companyId)
    .eq('status', 'completed')
    .gte('created_at', fromDate.toISOString());

  const sales = data || [];
  const totalRevenue = sales.reduce((s: number, r: any) => s + Number(r.total), 0);
  const totalTax = sales.reduce((s: number, r: any) => s + Number(r.tax_amount), 0);
  const totalDiscount = sales.reduce((s: number, r: any) => s + Number(r.discount), 0);
  const count = sales.length;
  const avgOrder = count > 0 ? totalRevenue / count : 0;
  const byPayment: Record<string, number> = {};
  sales.forEach((s: any) => {
    byPayment[s.payment_method] = (byPayment[s.payment_method] || 0) + Number(s.total);
  });
  return { period, totalRevenue, totalTax, totalDiscount, count, avgOrder, byPayment };
}

async function getTopProducts(
  supabase: any,
  companyId: string,
  period: 'week' | 'month' | 'year'
) {
  const now = new Date();
  let fromDate: Date;
  if (period === 'week') fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  else if (period === 'month') fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
  else fromDate = new Date(now.getFullYear(), 0, 1);

  const { data: saleIds } = await supabase
    .from('sales').select('id').eq('company_id', companyId)
    .eq('status', 'completed').gte('created_at', fromDate.toISOString());

  if (!saleIds?.length) return [];

  const { data: items } = await supabase
    .from('sale_items').select('name, quantity, total')
    .in('sale_id', saleIds.map((s: any) => s.id));

  const agg: Record<string, { name: string; qty: number; revenue: number }> = {};
  (items || []).forEach((item: any) => {
    if (!agg[item.name]) agg[item.name] = { name: item.name, qty: 0, revenue: 0 };
    agg[item.name].qty += Number(item.quantity);
    agg[item.name].revenue += Number(item.total);
  });
  return Object.values(agg).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
}

async function getTopCustomers(
  supabase: any,
  companyId: string,
  period: 'week' | 'month' | 'year'
) {
  const now = new Date();
  let fromDate: Date;
  if (period === 'week') fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  else if (period === 'month') fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
  else fromDate = new Date(now.getFullYear(), 0, 1);

  const { data: sales } = await supabase
    .from('sales').select('customer_id, total, customers(name)')
    .eq('company_id', companyId).eq('status', 'completed')
    .gte('created_at', fromDate.toISOString()).not('customer_id', 'is', null);

  const agg: Record<string, { name: string; spent: number; visits: number }> = {};
  (sales || []).forEach((s: any) => {
    const id = s.customer_id;
    if (!agg[id]) agg[id] = { name: s.customers?.name || 'Unknown', spent: 0, visits: 0 };
    agg[id].spent += Number(s.total);
    agg[id].visits += 1;
  });
  return Object.values(agg).sort((a, b) => b.spent - a.spent).slice(0, 10);
}

async function getInventoryOverview(
  supabase: any,
  companyId: string
) {
  const { data } = await supabase
    .from('products').select('stock_quantity, cost, price, low_stock_threshold')
    .eq('company_id', companyId).eq('is_active', true);

  const products = data || [];
  return {
    totalItems: products.length,
    totalStockValue: products.reduce((s: number, p: any) => s + Number(p.stock_quantity) * Number(p.cost), 0),
    totalRetailValue: products.reduce((s: number, p: any) => s + Number(p.stock_quantity) * Number(p.price), 0),
    outOfStock: products.filter((p: any) => Number(p.stock_quantity) === 0).length,
    lowStock: products.filter((p: any) => Number(p.stock_quantity) > 0 && Number(p.stock_quantity) <= Number(p.low_stock_threshold)).length,
  };
}

// ─── Keyword-based router (no AI needed, 100% reliable) ─────────────────────

async function getCustomerStats(
  supabase: any,
  companyId: string
) {
  const { data, count } = await supabase
    .from('customers')
    .select('name, email, phone, created_at', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    totalCustomers: count ?? (data?.length ?? 0),
    recentCustomers: (data || []).map((c: any) => ({
      name: c.name,
      email: c.email || 'N/A',
      phone: c.phone || 'N/A',
      joined: new Date(c.created_at).toLocaleDateString(),
    })),
  };
}

type ToolCall =
  | { name: 'get_low_stock_products' }
  | { name: 'get_inventory_overview' }
  | { name: 'get_customer_stats' }
  | { name: 'get_sales_summary'; period: 'today' | 'week' | 'month' | 'year' }
  | { name: 'get_top_products'; period: 'week' | 'month' | 'year' }
  | { name: 'get_top_customers'; period: 'week' | 'month' | 'year' }
  | null;

function detectPeriod(q: string): 'today' | 'week' | 'month' | 'year' {
  if (/today|daily|this day/.test(q)) return 'today';
  if (/this week|last 7|7 day|weekly/.test(q)) return 'week';
  if (/this year|annual|yearly/.test(q)) return 'year';
  return 'month'; // default
}

function detectPeriodWM(q: string): 'week' | 'month' | 'year' {
  if (/this week|last 7|7 day|weekly/.test(q)) return 'week';
  if (/this year|annual|yearly/.test(q)) return 'year';
  return 'month';
}

function routeQuery(query: string): ToolCall {
  const q = query.toLowerCase();

  // Low stock / inventory warnings
  if (/low stock|out of stock|running out|reorder|stock alert|inventory warn|item.*run/.test(q)) {
    return { name: 'get_low_stock_products' };
  }

  // Inventory overview / value
  if (/inventory|stock value|stock overview|how many product|total product|retail value|stock level/.test(q)) {
    return { name: 'get_inventory_overview' };
  }

  // Sales / revenue / tax / transactions
  if (/sale|revenue|income|earning|transaction|tax collect|how much.*make|how much.*earn|total.*today|sales.*today|today.*sales|money/.test(q)) {
    return { name: 'get_sales_summary', period: detectPeriod(q) };
  }

  // Top / best selling products
  if (/top product|best.*sell|best.*product|popular product|most sold|highest.*sell|sell the most/.test(q)) {
    return { name: 'get_top_products', period: detectPeriodWM(q) };
  }

  // Top / best customers
  if (/top customer|best customer|loyal customer|most.*spend|biggest.*spend|customer.*spend|highest.*customer/.test(q)) {
    return { name: 'get_top_customers', period: detectPeriodWM(q) };
  }

  // Customer count / list
  if (/how many customer|number of customer|customer count|total customer|list.*customer|customer.*list|customer.*have|our customer/.test(q)) {
    return { name: 'get_customer_stats' };
  }

  return null;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { messages, companyId, currency } = await req.json();

    if (!companyId) return NextResponse.json({ error: 'No active company.' }, { status: 400 });
    if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'GROQ_API_KEY not set.' }, { status: 500 });

    const authHeader = req.headers.get('authorization') || '';
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const userMessage = messages[messages.length - 1]?.content || '';
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    // ── Step 1: Route query to the right tool ──
    const toolCall = routeQuery(userMessage);
    let dataContext = '';

    if (toolCall) {
      try {
        let result: any;
        if (toolCall.name === 'get_low_stock_products') {
          result = await getLowStockProducts(supabase, companyId);
        } else if (toolCall.name === 'get_inventory_overview') {
          result = await getInventoryOverview(supabase, companyId);
        } else if (toolCall.name === 'get_customer_stats') {
          result = await getCustomerStats(supabase, companyId);
        } else if (toolCall.name === 'get_sales_summary') {
          result = await getSalesSummary(supabase, companyId, toolCall.period);
        } else if (toolCall.name === 'get_top_products') {
          result = await getTopProducts(supabase, companyId, toolCall.period);
        } else if (toolCall.name === 'get_top_customers') {
          result = await getTopCustomers(supabase, companyId, toolCall.period);
        }
        dataContext = `\n\nLive data from database (${toolCall.name}):\n${JSON.stringify(result, null, 2)}`;
      } catch (e: any) {
        dataContext = `\n\nFailed to fetch data: ${e.message}`;
      }
    }

    // ── Step 2: Generate natural language answer ──
    const systemPrompt = `You are a concise POS business assistant. Currency: ${currency || 'USD'}. Today: ${today}.
Use the live data provided to answer directly. Keep answers SHORT and clean.
Rules:
- Use **bold** for key numbers/labels only
- Use short bullet lists (3-5 items max) when listing multiple things
- Never add "How I arrived at this" or lengthy explanations
- Never say "based on the data" or "the live JSON shows" — just answer directly
- If data is empty, say so in one line`;

    const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(0, -1).map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      {
        role: 'user',
        content: userMessage + dataContext,
      },
    ];

    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: chatMessages,
      temperature: 0.5,
      max_tokens: 512,
    });

    const reply = response.choices[0].message.content || 'No response generated.';
    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error('[Agent Error]', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
