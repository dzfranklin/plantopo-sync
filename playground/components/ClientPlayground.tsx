import Button from "./Button";
import { useEffect, useRef, useState } from "react";
import DocPlayground from "./DocPlayground";
import PlaygroundShell from "./PlaygroundShell";
import { ClientDoc, ClientDocSave } from "../../core";
import Highlight from "react-highlight";
import { PlaygroundClientDocPersistence } from "@/lib/PlaygroundPersistence";
import { JSONComponent } from "./JSONComponent";
import { CircuitStatus, PlaygroundNetwork } from "@/lib/PlaygroundNetwork";

export default function ClientPlayground({
  circuit,
  doc,
  persistence,
  network,
}: {
  circuit: string;
  doc: ClientDoc;
  persistence: PlaygroundClientDocPersistence;
  network: PlaygroundNetwork;
}) {
  return (
    <PlaygroundShell
      header={
        <>
          <h2 className="mr-auto font-medium">{doc.clientId}</h2>
          <CircuitControls network={network} circuit={circuit} />
        </>
      }
    >
      <div className="flex flex-col gap-1 mb-1">
        <PeersInfo doc={doc} />
        <AwareEdit doc={doc} />
        <PersistenceInfo persistence={persistence} />
        <StatusInfo doc={doc} />
      </div>
      <DocPlayground doc={doc} />
    </PlaygroundShell>
  );
}

function AwareEdit({ doc }: { doc: ClientDoc }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(() =>
    JSON.stringify(doc.awareness(), null, 2)
  );
  return (
    <details className="text-xs">
      <summary>
        <span className="font-medium">Awareness</span>: <code>{value}</code>
      </summary>

      <textarea
        ref={ref}
        className="w-full"
        rows={4}
        value={value}
        onChange={(evt) => {
          const value = evt.target.value;
          setError(null);
          setValue(value);
          try {
            doc.setAwareness(JSON.parse(value));
          } catch (e) {
            setError(e!.toString());
          }
        }}
      />
      {error && <div className="text-xs text-red-600">{error}</div>}
    </details>
  );
}

function PeersInfo({ doc }: { doc: ClientDoc }) {
  const [peers, setPeers] = useState(() => doc.peers());
  useEffect(() => doc.onPeersChange(setPeers), [doc]);
  return (
    <details className="text-xs">
      <summary>
        <span className="font-medium">Peers</span>: {peers.length}
      </summary>
      <ul className="mb-2">
        {peers.map((peer) => (
          <li key={peer.id} className="my-2">
            <h3 className="text-sm font-medium">{peer.id}</h3>
            <Highlight className="json">
              {JSON.stringify(peer.awareness, null, 2)}
            </Highlight>
          </li>
        ))}
      </ul>
    </details>
  );
}

function PersistenceInfo({
  persistence,
}: {
  persistence: PlaygroundClientDocPersistence;
}) {
  const [values, setValues] = useState<ClientDocSave[] | undefined>();
  useEffect(() => {
    setValues(persistence.get("doc1"));
    return persistence.onChange("doc1", setValues);
  }, [persistence]);

  const [selected, setSelected] = useState<number | null>(null);
  const value = values?.at(selected ?? -1);

  function changeSelected(delta: number, dryRun: boolean = false): boolean {
    if (!values || values.length === 0) return false;
    let s = (selected ?? values.length - 1) + delta;
    if (s < 0 || s >= values.length) return false;
    if (!dryRun) setSelected(s);
    return true;
  }

  return (
    <details className="text-xs">
      <summary className="font-medium">Persistence</summary>

      <div>
        <div className="gap-2 flex justify-end items-baseline">
          <Button
            small
            disabled={!changeSelected(-1, true)}
            onClick={() => setSelected(0)}
          >
            Oldest
          </Button>
          <Button
            small
            disabled={!changeSelected(-1, true)}
            onClick={() => changeSelected(-1)}
          >
            Previous
          </Button>
          <span>
            {selected !== null ? selected + 1 : "latest"} / {values?.length}
          </span>
          <Button
            small
            disabled={!changeSelected(1, true)}
            onClick={() => changeSelected(1)}
          >
            Next
          </Button>
          <Button
            small
            disabled={!changeSelected(1, true)}
            onClick={() => setSelected(null)}
          >
            Latest
          </Button>
        </div>
        <Highlight className="my-2 p-2 text-sm json">
          {value ? JSON.stringify(value, null, 2) : "undefined"}
        </Highlight>
      </div>
    </details>
  );
}

function StatusInfo({ doc }: { doc: ClientDoc }) {
  const [status, setStatus] = useState(doc.status());
  useEffect(() => doc.onStatusChange(setStatus), [doc]);
  return (
    <details className="text-xs">
      <summary>
        <span className="font-medium">Status</span>
        <span className="ml-2 inline-flex gap-2">
          <span>{status.unsyncedChanges} unsynced</span>
        </span>
      </summary>

      <JSONComponent value={status} />
    </details>
  );
}

function CircuitControls({
  network,
  circuit,
}: {
  network: PlaygroundNetwork;
  circuit: string;
}) {
  const [status, setStatus] = useState<CircuitStatus>(() =>
    network.status(circuit)
  );
  useEffect(() => {
    setStatus(network.status(circuit));
    network.onStatus(circuit, setStatus);
  }, [network, circuit]);

  return (
    <div className="flex items-baseline gap-1 text-xs">
      <span className="font-medium">Circuit</span>
      <span className="flex gap-1 truncate">
        {!status.connected && <span>disconnected</span>}
        {status.interrupted && <span>interrupted</span>}
        {status.disabled && <span>disabled</span>}
      </span>
      <Button
        small
        onClick={() =>
          status.disabled ? network.enable(circuit) : network.disable(circuit)
        }
      >
        {status.disabled ? "Enable" : "Disable"}
      </Button>
      <Button
        small
        onClick={() => network.disconnect(circuit)}
        disabled={!status.connected}
      >
        Disconnect
      </Button>
      <Button
        small
        onClick={() =>
          status.interrupted
            ? network.resume(circuit)
            : network.interrupt(circuit)
        }
        disabled={!status.connected}
      >
        {status.interrupted ? "Resume" : "Interrupt"}
      </Button>
    </div>
  );
}
