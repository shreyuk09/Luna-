// Short, collision-resistant-enough ids for a client-side app.
export const uid = (prefix = '') =>
  prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
