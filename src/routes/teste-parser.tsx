import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { extractPdfText } from "@/lib/bank-parser/extractor";

export const Route = createFileRoute("/teste-parser")({
  component: TesteParser,
});

function TesteParser() {
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);

  async function selecionarArquivo(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];

    if (!file) return;

    setLoading(true);

    try {
      const resultado = await extractPdfText(file);
      setTexto(resultado);
    } catch (err) {
      console.error(err);
      alert("Erro ao ler PDF");
    }

    setLoading(false);
  }

  return (
    <div className="max-w-6xl mx-auto p-8">

      <h1 className="text-3xl font-bold mb-6">
        Teste do Parser
      </h1>

      <input
        type="file"
        accept=".pdf"
        onChange={selecionarArquivo}
      />

      {loading && (
        <p className="mt-4">
          Lendo PDF...
        </p>
      )}

      <textarea
        className="w-full h-[600px] mt-6 border rounded p-4 font-mono text-sm"
        value={texto}
        readOnly
      />

    </div>
  );
}
