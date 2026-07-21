import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { parseCashClosingSheet, readClosingWorkbook, listClosingDaySheets, guessSheetForDate, type ClosingEntry } from "@/lib/cash-closing-parser";

interface Company { id: string; name: string }
interface Account { id: string; name: string; kind: string; company_id: string }

export function CashClosingImportDialog({
  companies,
  accounts,
  onImported,
}: {
  companies: Company[];
  accounts: Account[];
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<ClosingEntry[]>([]);
  const [accountByRow, setAccountByRow] = useState<Record<number, string>>({});
  const [fileName, setFileName] = useState("");
  const [workbook, setWorkbook] = useState<ReturnType<typeof readClosingWorkbook> | null>(null);
  const [daySheets, setDaySheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const companyAccounts = accounts.filter((a) => a.company_id === companyId);

  const accountIdForKind = (kind: string) =>
    companyAccounts.find((a) => a.kind === kind)?.id ?? "";

  const applySheet = (wb: ReturnType<typeof readClosingWorkbook>, sheetName: string) => {
    try {
      const parsed = parseCashClosingSheet(wb, sheetName);
      if (parsed.length === 0) {
        toast.error(`Nenhum lançamento encontrado na aba "${sheetName}"`);
      }
      setEntries(parsed);
      const defaults: Record<number, string> = {};
      parsed.forEach((e, i) => {
        defaults[i] = accountIdForKind(e.suggested_account_kind);
      });
      setAccountByRow(defaults);
      toast.success(`${parsed.length} lançamentos identificados na aba "${sheetName}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao ler a aba");
      setEntries([]);
    }
  };

  const handleFile = async (file: File) => {
    if (!companyId) {
      toast.error("Selecione a empresa antes de enviar a planilha");
      return;
    }
    setLoadingFile(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = readClosingWorkbook(buf);
      const sheets = listClosingDaySheets(wb);
      if (sheets.length === 0) {
        throw new Error('Não encontrei nenhuma aba de dia (ex.: "01", "02"...) nessa planilha.');
      }
      setWorkbook(wb);
      setDaySheets(sheets);
      const guess = guessSheetForDate(wb, date) ?? sheets[0];
      setSelectedSheet(guess);
      applySheet(wb, guess);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao ler a planilha");
      setEntries([]);
      setWorkbook(null);
      setDaySheets([]);
    } finally {
      setLoadingFile(false);
    }
  };

  const totalGeral = entries.reduce((s, e) => s + e.amount, 0);

  const save = async () => {
    if (!companyId) return toast.error("Selecione a empresa");
    if (entries.length === 0) return toast.error("Nada para importar");

    const missingAccount = entries.some((_, i) => !accountByRow[i]);
    if (missingAccount) return toast.error("Todo lançamento precisa de uma conta selecionada");

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();

    const payload = entries.map((e, i) => ({
      company_id: companyId,
      account_id: accountByRow[i],
      tx_date: date,
      client_name: e.client_name,
      budget_number: e.budget_number,
      description: `Fechamento de caixa — ${e.column_label}`,
      amount: e.amount,
      payment_method: e.payment_method as never,
      tx_type: "entrada" as const,
      created_by: userData.user?.id,
    }));

    const { error } = await supabase.from("cash_transactions").insert(payload as never);
    setSaving(false);
    if (error) return toast.error(error.message);

    toast.success(`${entries.length} lançamentos importados`);
    setEntries([]);
    setAccountByRow({});
    setFileName("");
    setWorkbook(null);
    setDaySheets([]);
    setOpen(false);
    onImported();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileSpreadsheet className="mr-1 h-4 w-4" /> Importar Fechamento (Excel)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar Fechamento de Caixa</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setEntries([]); setFileName(""); setWorkbook(null); setDaySheets([]); }}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="closing_date">Data</Label>
            <Input id="closing_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!companyId || loadingFile}
            onClick={() => inputRef.current?.click()}
          >
            {loadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {loadingFile ? "Lendo planilha..." : "Selecionar planilha (.xlsx)"}
          </Button>
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
        </div>

        {daySheets.length > 0 && (
          <div className="flex items-center gap-2">
            <Label className="text-xs">Aba (dia)</Label>
            <Select
              value={selectedSheet}
              onValueChange={(v) => {
                setSelectedSheet(v);
                if (workbook) applySheet(workbook, v);
              }}
            >
              <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {daySheets.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              Confira se é a aba certa para a data selecionada acima.
            </span>
          </div>
        )}

        {entries.length > 0 && (
          <div className="max-h-[45vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Orçamento</TableHead>
                  <TableHead>Coluna</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Conta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{e.client_name}</TableCell>
                    <TableCell className="text-sm">{e.budget_number ?? "—"}</TableCell>
                    <TableCell className="text-sm">{e.column_label}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{brl(e.amount)}</TableCell>
                    <TableCell>
                      <Select
                        value={accountByRow[i] ?? ""}
                        onValueChange={(v) => setAccountByRow((prev) => ({ ...prev, [i]: v }))}
                      >
                        <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {companyAccounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {entries.length > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{entries.length} lançamentos</span>
            <span className="font-semibold">Total: {brl(totalGeral)}</span>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="button" onClick={save} disabled={saving || entries.length === 0}>
            {saving ? "Importando..." : `Importar ${entries.length || ""} lançamentos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
