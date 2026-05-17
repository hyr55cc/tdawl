// api/crypto.js — أسعار العملات الرقمية من CoinGecko (مجاني 100%)

const COINS = [
  { id: 'bitcoin',  sym: 'BTC', name: 'Bitcoin'  },
  { id: 'ethereum', sym: 'ETH', name: 'Ethereum' },
  { id: 'binancecoin', sym: 'BNB', name: 'BNB'   },
  { id: 'solana',   sym: 'SOL', name: 'Solana'   },
  { id: 'ripple',   sym: 'XRP', name: 'XRP'      },
];

let cache = { data: null, ts: 0 };
const CACHE_TTL = 2 * 60 * 1000; // دقيقتان

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_TTL) {
    return res.status(200).json({ ok: true, cached: true, updatedAt: new Date(cache.ts).toISOString(), data: cache.data });
  }

  try {
    const ids = COINS.map(c => c.id).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_last_updated_at=true`;

    const r = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BigMargin/1.0',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!r.ok) throw new Error(`CoinGecko HTTP ${r.status}`);
    const json = await r.json();

    const data = COINS.map(coin => {
      const q = json[coin.id];
      if (!q || !q.usd) {
        return { id: coin.sym, sym: coin.sym, name: coin.name, cat: 'crypto', price: null, error: 'unavailable' };
      }
      const price     = parseFloat(q.usd.toFixed(q.usd < 1 ? 4 : 2));
      const changePct = parseFloat((q.usd_24h_change || 0).toFixed(2));
      const change    = parseFloat((price * changePct / 100).toFixed(q.usd < 1 ? 4 : 2));
      const prevClose = parseFloat((price - change).toFixed(q.usd < 1 ? 4 : 2));

      return {
        id:         coin.sym,
        sym:        coin.sym,
        name:       coin.name,
        cat:        'crypto',
        price,
        change,
        changePct,
        prevClose,
        volume:     Math.round(q.usd_24h_vol || 0),
        updatedAt:  new Date((q.last_updated_at || now/1000) * 1000).toISOString(),
        source:     'coingecko',
      };
    });

    cache = { data, ts: now };

    return res.status(200).json({
      ok: true,
      cached: false,
      updatedAt: new Date().toISOString(),
      found: `${data.filter(d => d.price !== null).length}/${COINS.length}`,
      data,
    });

  } catch (err) {
    console.error('crypto error:', err.message);
    if (cache.data) {
      return res.status(200).json({ ok: true, cached: true, stale: true, updatedAt: new Date(cache.ts).toISOString(), data: cache.data });
    }
    return res.status(500).json({ ok: false, error: err.message });
  }
}
