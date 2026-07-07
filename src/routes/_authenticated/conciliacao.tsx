import { parseBankStatement } from "@/lib/bank-parser";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useRef, useEffect } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { brl, dateBR, PAYMENT_METHODS } from "@/lib/format";
import { parseStatementPdf, type ParsedStatement, type ParsedStatementItem } from "@/lib/pdf-statement-parser";
import { CheckCircle2, AlertCircle, XCircle, Upload, FileText, Loader2, Link2, Unlink } from "lucide-react";

const searchSchema = z.object({
  date: fallback(z.string(), new Date().toISOString().slice(0, 10)).default(new Date().toISOString().slice(0, 10)),
});

export const Route = createFileRoute("/_authenticated/conciliacao")({
  ssr: false,
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "Conciliação Bancária — Glass ERP" }] }),
  component: ConciliacaoPage,
});

const BANKS = [
  "Itaú", "Bradesco", "Banco do Brasil", "Santander", "Caixa",
  "Nubank", "Inter", "Sicoob", "Sicredi", "Safra", "BTG Pactual",
  "C6 Bank", "PagBank", "Mercado Pago", "Outro",
] as const;

interface Tx {
  id: string;
  tx_date: string;
  description: string;
  amount: number;
  tx_type: "entrada" | "saida";
  reconciled: boolean;
  payment_method: string;
}

type MatchStatus = "matched" | "unmatched" | "divergent";
interface MatchedItem extends ParsedStatementItem {
  matched_tx_id: string | null;
  status: MatchStatus;
  manual?: boolean;
}

function ConciliacaoPage() {
  const { date } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const [matches, setMatches] = useState<MatchedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [bank, setBank] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: dayTx } = useQuery({
    queryKey: ["conciliacao-day", date],
    queryFn: async () => {
      const { data } = await supabase
        .from("cash_transactions")
        .select("id, tx_date, description, amount, tx_type, reconciled, payment_method")
        .eq("tx_date", date);
      return (data ?? []) as Tx[];
    },
  });

  const doMatch = (items: ParsedStatementItem[], txs: Tx[]): MatchedItem[] => {
    const used = new Set<string>();
    return items.map((it) => {
      const wantType = it.direction === "credit" ? "entrada" : "saida";
      // Score candidates: same value & direction is required; +2 for payment_method match
      const scored = txs
        .filter((t) => !used.has(t.id) && t.tx_type === wantType && Math.abs(Number(t.amount) - it.amount) < 0.01)
        .map((t) => ({
          t,
          score: (it.inferred_payment_method && t.payment_method === it.inferred_payment_method) ? 2 : 1,
        }))
        .sort((a, b) => b.score - a.score);
      if (scored.length > 0) {
        used.add(scored[0].t.id);
        return { ...it, matched_tx_id: scored[0].t.id, status: "matched" as MatchStatus };
      }
      // Divergent: value matches but direction wrong, OR close value
      const wrongDir = txs.find((t) => !used.has(t.id) && Math.abs(Number(t.amount) - it.amount) < 0.01);
      if (wrongDir) return { ...it, matched_tx_id: wrongDir.id, status: "divergent" as MatchStatus };
      const close = txs.find((t) => !used.has(t.id) && Math.abs(Number(t.amount) - it.amount) < 1);
      if (close) return { ...it, matched_tx_id: close.id, status: "divergent" as MatchStatus };
      return { ...it, matched_tx_id: null, status: "unmatched" as MatchStatus };
    });
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    setFileName(file.name);
    try {
     const p = await parseBankStatement(file);
      setParsed(p);
      if (!bank && p.bank_hint) setBank(p.bank_hint);
      const txs = dayTx ?? [];
      setMatches(doMatch(p.items, txs));
      toast.success(`${p.items.length} lançamentos extraídos do PDF`);
    } catch (e) {
      toast.error("Erro ao ler PDF: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  // Re-run matching when transactions load after parsing
  useEffect(() => {
    if (parsed && dayTx && matches.every((m) => !m.manual)) {
      setMatches(doMatch(parsed.items, dayTx));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayTx?.length]);

  const setRowMatch = (idx: number, txId: string | null) => {
    setMatches((prev) => {
      const next = [...prev];
      const m = { ...next[idx], manual: true };
      if (txId === null) {
        m.matched_tx_id = null;
        m.status = "unmatched";
      } else {
        const tx = (dayTx ?? []).find((t) => t.id === txId);
        m.matched_tx_id = txId;
        const wantType = m.direction === "credit" ? "entrada" : "saida";
        const sameAmount = tx && Math.abs(Number(tx.amount) - m.amount) < 0.01;
        const sameDir = tx && tx.tx_type === wantType;
        m.status = (sameAmount && sameDir) ? "matched" : "divergent";
      }
      next[idx] = m;
      return next;
    });
  };

  const applyReconciliation = async () => {
    const matchedTxIds = matches.filter((m) => m.status === "matched" && m.matched_tx_id).map((m) => m.matched_tx_id!);
    if (matchedTxIds.length === 0) { toast.error("Nenhum lançamento conciliado para aplicar"); return; }
    setLoading(true);
    const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
    const { error } = await supabase.from("cash_transactions")
      .update({ reconciled: true, reconciled_at: new Date().toISOString(), reconciled_by: uid })
      .in("id", matchedTxIds);
    setLoading(false);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(`${matchedTxIds.length} lançamento(s) marcado(s) como conciliado(s)`);
    qc.invalidateQueries({ queryKey: ["conciliacao-day", date] });
    qc.invalidateQueries({ queryKey: ["extrato-day", date] });
  };

  const summary = useMemo(() => {
    const matched = matches.filter((m) => m.status === "matched").length;
    const divergent = matches.filter((m) => m.status === "divergent").length;
    const unmatched = matches.filter((m) => m.status === "unmatched").length;
    const usedTxIds = new Set(matches.filter((m) => m.matched_tx_id).map((m) => m.matched_tx_id));
    const notInPdf = (dayTx ?? []).filter((t) => !usedTxIds.has(t.id));
    return { matched, divergent, unmatched, notInPdf };
  }, [matches, dayTx]);

  const pmLabel = (v: string | null) => v ? (PAYMENT_METHODS.find((p) => p.value === v)?.label ?? v) : "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conciliação Bancária</h1>
          <p className="text-sm text-muted-foreground">Envie o extrato do banco (PDF), informe qual banco é e concilie automaticamente ou manualmente.</p>
        </div>
        <div>
          <Label htmlFor="cdate" className="text-xs">Data</Label>
          <Input
            id="cdate"
            type="date"
            value={date}
            onChange={(e) => navigate({ search: { date: e.target.value }, replace: true })}
            className="h-9"
          />
        </div>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <Label className="text-xs">Extrato bancário (PDF)</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {fileName ? <>Arquivo: <span className="font-medium text-foreground">{fileName}</span></> : "Envie o PDF exportado do internet banking — o banco será identificado automaticamente."}
              {(bank || parsed?.bank_hint) && <> · Detectado: <span className="font-medium">{bank || parsed?.bank_hint}</span></>}
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {loading ? "Processando..." : "Selecionar PDF"}
          </Button>
        </div>
      </Card>

      {parsed && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Card className="p-4">
              <div className="text-xs uppercase text-muted-foreground">Banco</div>
              <div className="mt-1 text-lg font-semibold">{bank || parsed.bank_hint || "Genérico"}</div>
              <div className="text-xs text-muted-foreground">{parsed.items.length} lançamentos no PDF</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase text-muted-foreground">Conciliados ✓</div>
              <div className="mt-1 text-xl font-bold text-[color:var(--success)]">{summary.matched}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase text-muted-foreground">Divergentes</div>
              <div className="mt-1 text-xl font-bold text-amber-500">{summary.divergent}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase text-muted-foreground">Não encontrados</div>
              <div className="mt-1 text-xl font-bold text-destructive">{summary.unmatched}</div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Aplicar conciliação</h3>
                <p className="text-xs text-muted-foreground">Marca os {summary.matched} lançamento(s) com status "Confere" como conciliados no sistema.</p>
              </div>
              <Button onClick={applyReconciliation} disabled={loading || summary.matched === 0}>
                <CheckCircle2 className="h-4 w-4" /> Aplicar {summary.matched} conciliação(ões)
              </Button>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b p-4">
              <h3 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Itens do extrato — comparação e edição manual</h3>
              <p className="mt-1 text-xs text-muted-foreground">Compare valor, tipo e forma de pagamento. Use o seletor da direita para vincular manualmente ou desvincular.</p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-24">Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-24">Tipo</TableHead>
                    <TableHead className="w-28">Pagto (PDF)</TableHead>
                    <TableHead className="text-right w-32">Valor</TableHead>
                    <TableHead className="min-w-[240px]">Lançamento no app / Vincular</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum item extraído.</TableCell></TableRow>
                  )}
                  {matches.map((m, i) => {
                    const tx = m.matched_tx_id ? (dayTx ?? []).find((t) => t.id === m.matched_tx_id) : null;
                    const options = (dayTx ?? []).filter((t) => t.tx_type === (m.direction === "credit" ? "entrada" : "saida"));
                    return (
                      <TableRow key={i} className={m.status === "matched" ? "bg-[color:var(--success)]/5" : undefined}>
                        <TableCell>
                          {m.status === "matched" && <Badge className="gap-1 bg-[color:var(--success)] hover:bg-[color:var(--success)]"><CheckCircle2 className="h-3 w-3" />{m.manual ? " Manual" : " Confere"}</Badge>}
                          {m.status === "divergent" && <Badge className="gap-1 bg-amber-500 hover:bg-amber-500"><AlertCircle className="h-3 w-3" /> Divergente</Badge>}
                          {m.status === "unmatched" && <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Não achado</Badge>}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">{dateBR(m.item_date)}</TableCell>
                        <TableCell className="max-w-md truncate text-sm">{m.description}</TableCell>
                        <TableCell className="text-xs">{m.direction === "credit" ? "Crédito" : "Débito"}</TableCell>
                        <TableCell className="text-xs">{pmLabel(m.inferred_payment_method)}</TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${m.direction === "credit" ? "text-[color:var(--success)]" : "text-destructive"}`}>
                          {brl(m.amount)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select
                              value={m.matched_tx_id ?? "none"}
                              onValueChange={(v) => setRowMatch(i, v === "none" ? null : v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Vincular a...">
                                  {tx ? (
                                    <span className="flex items-center gap-1">
                                      <Link2 className="h-3 w-3" />
                                      <span className="truncate max-w-[180px]">{tx.description} · {brl(Number(tx.amount))} · {pmLabel(tx.payment_method)}</span>
                                    </span>
                                  ) : "Não vinculado"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent className="max-w-[420px]">
                                <SelectItem value="none">— Não vinculado —</SelectItem>
                                {options.map((o) => (
                                  <SelectItem key={o.id} value={o.id}>
                                    {brl(Number(o.amount))} · {pmLabel(o.payment_method)} · {o.description}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {m.matched_tx_id && (
                              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setRowMatch(i, null)} title="Desvincular">
                                <Unlink className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {summary.notInPdf.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b p-4">
                <h3 className="font-semibold flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" /> Lançamentos do app sem correspondência no extrato ({summary.notInPdf.length})
                </h3>
                <p className="text-xs text-muted-foreground mt-1">Registros no sistema que não bateram com nenhuma linha do PDF.</p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead className="w-20">Tipo</TableHead>
                      <TableHead className="text-right w-32">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.notInPdf.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-sm max-w-md truncate">{t.description}</TableCell>
                        <TableCell className="text-xs">{pmLabel(t.payment_method)}</TableCell>
                        <TableCell className="text-xs">{t.tx_type}</TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${t.tx_type === "entrada" ? "text-[color:var(--success)]" : "text-destructive"}`}>
                          {brl(Number(t.amount))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </>
      )}

      {!parsed && !loading && (
        <Card className="p-8 text-center text-muted-foreground">
          <FileText className="mx-auto h-10 w-10 opacity-50" />
          <p className="mt-3 text-sm">Selecione o banco e envie um extrato PDF para começar a conciliação do dia <span className="font-medium text-foreground">{dateBR(date)}</span>.</p>
        </Card>
      )}
    </div>
  );
}
