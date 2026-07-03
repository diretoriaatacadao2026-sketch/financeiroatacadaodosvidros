import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useRef } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { brl, dateBR } from "@/lib/format";
import { parseStatementPdf, type ParsedStatement, type ParsedStatementItem } from "@/lib/pdf-statement-parser";
import { CheckCircle2, AlertCircle, XCircle, Upload, FileText, Loader2 } from "lucide-react";

const searchSchema = z.object({
  date: fallback(z.string(), new Date().toISOString().slice(0, 10)).default(new Date().toISOString().slice(0, 10)),
});

export const Route = createFileRoute("/_authenticated/conciliacao")({
  ssr: false,
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "Conciliação Bancária — Glass ERP" }] }),
  component: ConciliacaoPage,
});

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
}

function ConciliacaoPage() {
  const { date } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const [matches, setMatches] = useState<MatchedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string>("");
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
      // Look for an unused tx with same value and matching direction
      const wantType = it.direction === "credit" ? "entrada" : "saida";
      const candidates = txs.filter((t) =>
        !used.has(t.id)
        && t.tx_type === wantType
        && Math.abs(Number(t.amount) - it.amount) < 0.01
      );
      if (candidates.length > 0) {
        used.add(candidates[0].id);
        return { ...it, matched_tx_id: candidates[0].id, status: "matched" as MatchStatus };
      }
      // Divergent: same amount, wrong direction? Or close amount?
      const close = txs.filter((t) => !used.has(t.id) && Math.abs(Number(t.amount) - it.amount) < 1);
      if (close.length > 0) {
        return { ...it, matched_tx_id: close[0].id, status: "divergent" as MatchStatus };
      }
      return { ...it, matched_tx_id: null, status: "unmatched" as MatchStatus };
    });
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    setFileName(file.name);
    try {
      const p = await parseStatementPdf(file);
      setParsed(p);
      const txs = dayTx ?? [];
      setMatches(doMatch(p.items, txs));
      toast.success(`${p.items.length} lançamentos extraídos do PDF`);
    } catch (e) {
      toast.error("Erro ao ler PDF: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
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
    const usedTxIds = new Set(matches.filter((m) => m.status === "matched").map((m) => m.matched_tx_id));
    const notInPdf = (dayTx ?? []).filter((t) => !usedTxIds.has(t.id));
    return { matched, divergent, unmatched, notInPdf };
  }, [matches, dayTx]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conciliação Bancária</h1>
          <p className="text-sm text-muted-foreground">Upload do extrato do banco (PDF) e comparação com os lançamentos do dia</p>
        </div>
        <div className="flex items-end gap-2">
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
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">1. Enviar extrato bancário</h3>
            <p className="text-xs text-muted-foreground">PDF exportado do internet banking. {fileName && <span className="font-medium text-foreground">Arquivo: {fileName}</span>}</p>
          </div>
          <div className="flex items-center gap-2">
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
        </div>
      </Card>

      {parsed && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Card className="p-4">
              <div className="text-xs uppercase text-muted-foreground">Banco detectado</div>
              <div className="mt-1 text-lg font-semibold">{parsed.bank_hint ?? "Genérico"}</div>
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
                <h3 className="font-semibold">2. Aplicar conciliação</h3>
                <p className="text-xs text-muted-foreground">Marca os {summary.matched} lançamento(s) com correspondência exata como conciliados no sistema.</p>
              </div>
              <Button onClick={applyReconciliation} disabled={loading || summary.matched === 0}>
                <CheckCircle2 className="h-4 w-4" /> Aplicar {summary.matched} conciliação(ões)
              </Button>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b p-4">
              <h3 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Itens do extrato do banco</h3>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-24">Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-20">Tipo</TableHead>
                    <TableHead className="text-right w-32">Valor</TableHead>
                    <TableHead>Lançamento no app</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum item extraído.</TableCell></TableRow>
                  )}
                  {matches.map((m, i) => {
                    const tx = m.matched_tx_id ? (dayTx ?? []).find((t) => t.id === m.matched_tx_id) : null;
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          {m.status === "matched" && <Badge className="gap-1 bg-[color:var(--success)] hover:bg-[color:var(--success)]"><CheckCircle2 className="h-3 w-3" /> Confere</Badge>}
                          {m.status === "divergent" && <Badge className="gap-1 bg-amber-500 hover:bg-amber-500"><AlertCircle className="h-3 w-3" /> Divergente</Badge>}
                          {m.status === "unmatched" && <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Não achado</Badge>}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">{dateBR(m.item_date)}</TableCell>
                        <TableCell className="max-w-md truncate text-sm">{m.description}</TableCell>
                        <TableCell className="text-xs">{m.direction === "credit" ? "Crédito" : "Débito"}</TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${m.direction === "credit" ? "text-[color:var(--success)]" : "text-destructive"}`}>
                          {brl(m.amount)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {tx ? <span className="truncate">{tx.description} · {brl(Number(tx.amount))}</span> : "—"}
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
                        <TableCell className="text-xs">{t.payment_method}</TableCell>
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
          <p className="mt-3 text-sm">Envie um extrato PDF do banco para começar a conciliação do dia <span className="font-medium text-foreground">{dateBR(date)}</span>.</p>
        </Card>
      )}
    </div>
  );
}
