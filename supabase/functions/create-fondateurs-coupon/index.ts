const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SB_SERVICE  = Deno.env.get('FIXLYY_SERVICE_ROLE_KEY')!


Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${SB_SERVICE}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const res = await fetch('https://api.stripe.com/v1/coupons', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      id: 'FONDATEURS',
      amount_off: '30000',
      currency: 'eur',
      duration: 'once',
      name: 'Prix Fondateurs',
    }).toString(),
  })
  const d = await res.json()
  return new Response(JSON.stringify(d), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
})
