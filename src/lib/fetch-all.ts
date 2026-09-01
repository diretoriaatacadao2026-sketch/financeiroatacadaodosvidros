/**
 * O backend devolve no máximo 1000 linhas por requisição.
 * Este helper busca em páginas até trazer todos os registros,
 * evitando totais incorretos em meses com muitos lançamentos.
 */
const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  buildQuery: () => {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  },
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; ; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}
