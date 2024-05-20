import { useEffect, useState } from "react";
import DocPlayground from "./DocPlayground";
import PlaygroundShell from "./PlaygroundShell";
import { ServerDoc, DocTree, ClientInfo, Changeset } from "@/core";
import Highlight from "react-highlight";
import { PlaygroundServerDocPersistence } from "@/lib/PlaygroundPersistence";

export default function ServerPlayground({
  doc,
  persistence,
}: {
  doc: ServerDoc;
  persistence: PlaygroundServerDocPersistence;
}) {
  const [state, setState] = useState<DocTree | null>(null);
  useEffect(() => {
    if (!doc) return;
    setState(doc.collect());
    return doc.onChange(() => setState(doc.collect()));
  }, [doc]);

  return (
    <PlaygroundShell
      header={
        <>
          <h2 className="font-medium mr-auto">server</h2>
        </>
      }
    >
      <div className="flex flex-col gap-1 mb-1">
        <ClientsComponent doc={doc} />
        <PersistenceComponent docId={doc.id} persistence={persistence} />
      </div>
      {state && <DocPlayground doc={doc} />}
    </PlaygroundShell>
  );
}

function ClientsComponent({ doc }: { doc: ServerDoc }) {
  const [clients, setClients] = useState<readonly ClientInfo[]>([]);
  useEffect(() => {
    setClients(doc.clients());
    return doc.onChange(() => setClients(doc.clients()));
  }, [doc]);

  return (
    <details className="text-xs">
      <summary>Clients</summary>

      <Highlight className="my-2 p-2 text-sm json">
        {JSON.stringify(clients, null, 2)}
      </Highlight>
    </details>
  );
}

function PersistenceComponent({
  docId,
  persistence,
}: {
  docId: string;
  persistence: PlaygroundServerDocPersistence;
}) {
  const [entries, setEntries] = useState<Changeset[] | undefined>();
  useEffect(() => {
    setEntries(persistence.get(docId));
    return persistence.onChange(docId, setEntries);
  }, [docId, persistence]);

  return (
    <details className="text-xs">
      <summary>Persistence</summary>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2 justify-end">
          <label>
            <input
              type="number"
              defaultValue={persistence.latencyMs}
              onChange={(e) => {
                try {
                  persistence.latencyMs = parseInt(e.target.value);
                } catch (e) {}
              }}
              className="mr-1 w-12 text-right text-sm border border-gray-300 rounded"
            />
            ms latency
          </label>
        </div>
        <Highlight className="my-2 p-2 text-sm json">
          {entries
            ? "[\n" +
              entries.map((c) => "  " + JSON.stringify(c)).join(",\n") +
              "\n]"
            : "undefined"}
        </Highlight>
      </div>
    </details>
  );
}
