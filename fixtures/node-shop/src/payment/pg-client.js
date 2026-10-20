export const pgClient = {
  async charge({ method, amount, installmentMonths }) {
    const res = await fetch('https://pg.example.com/v1/charge', { method: 'POST', body: JSON.stringify({ method, amount, installmentMonths }) });
    if (!res.ok) throw new Error(`PG ${res.status}`);
    return res.json();
  },
  async refund({ txId, amount }) {
    const res = await fetch('https://pg.example.com/v1/refund', { method: 'POST', body: JSON.stringify({ txId, amount }) });
    if (!res.ok) throw new Error(`PG ${res.status}`);
    return res.json();
  },
};
