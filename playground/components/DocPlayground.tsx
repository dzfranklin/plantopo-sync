import { Dispatch, useEffect, useRef, useState } from "react";
import Button from "./Button";
import { ClientDoc, DocTree, DocNode, ServerDoc } from "@/core";
import Dialog from "./Dialog";

type PlaygroundAction =
  | { type: "addNode"; parent: string }
  | {
      type: "setProperty";
      node: string;
      key: string;
      value: unknown;
    };

export default function DocPlayground({ doc }: { doc: ClientDoc | ServerDoc }) {
  const [state, setState] = useState<DocTree | null>(null);
  useEffect(() => {
    if (!doc) return;
    setState(doc.collect());
    return doc.onChange(() => setState(doc.collect()));
  }, [doc]);

  return <div>{state && <NodeComponent doc={doc} node={state} />}</div>;
}

function NodeComponent({
  doc,
  node,
}: {
  doc: ClientDoc | ServerDoc;
  node: DocNode;
}) {
  const [moveDialog, setMoveDialog] = useState(false);
  return (
    <>
      <div className="max-w-72 text-sm border border-gray-400 rounded p-2 mb-2">
        <details className="w-full max-w-full overflow-hidden">
          <summary>
            <span className="text-xs">{node.id}</span>
          </summary>

          <ul>
            {node.parent !== null && (
              <IdxComponent
                parentId={node.parent}
                nodeId={node.id}
                value={node.idx}
                doc={doc}
              />
            )}

            {Object.entries(node.props).map(([key, value]) => (
              <PropComponent
                key={key}
                nodeId={node.id}
                propKey={key}
                value={value}
                doc={doc}
              />
            ))}

            <li className="mt-2 flex justify-end gap-1">
              {doc instanceof ClientDoc && (
                <>
                  <Button
                    small
                    onClick={() => {
                      const key = prompt("Property");
                      if (!key) return;
                      doc.set(node.id, key, null);
                    }}
                  >
                    Set
                  </Button>

                  <Button
                    small
                    disabled={node.id === "root"}
                    onClick={() => setMoveDialog(true)}
                  >
                    Move
                  </Button>

                  {moveDialog && (
                    <MoveDialog
                      node={node}
                      doc={doc}
                      close={() => setMoveDialog(false)}
                    />
                  )}

                  <Button
                    small
                    disabled={node.id === "root"}
                    onClick={() => doc.delete(node.id)}
                  >
                    Delete
                  </Button>
                </>
              )}
            </li>
          </ul>
        </details>
      </div>
      <ul className="ml-4">
        <li className="mb-2">
          {doc instanceof ClientDoc && (
            <Button
              small
              onClick={() => {
                doc.add({ type: "firstChild", parent: node.id });
              }}
            >
              Child
            </Button>
          )}
        </li>

        {node.children.map((child) => (
          <li key={child.id}>
            <NodeComponent node={child} doc={doc} />
          </li>
        ))}
      </ul>
    </>
  );
}

function MoveDialog({
  node,
  doc,
  close,
}: {
  node: DocNode;
  doc: ClientDoc;
  close: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  function onSubmit() {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    const parent = data.get("parent") as string;
    const idx = data.get("idx") as string;
    doc.move(node.id, { type: "_force", parent, idx });
    close();
  }
  return (
    <Dialog
      onCancel={close}
      onAction={onSubmit}
      actionLabel="Move"
      title="Move node"
    >
      <form
        ref={formRef}
        onSubmit={() => onSubmit()}
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col">
          Parent
          <input
            type="text"
            name="parent"
            className="w-32 font-mono text-xs border border-gray-300 rounded px-1 py-0.5"
            defaultValue={node.parent ?? ""}
          />
        </label>

        <label className="flex flex-col">
          Index
          <input
            type="text"
            name="idx"
            className="w-32 font-mono text-xs border border-gray-300 rounded px-1 py-0.5"
            defaultValue={node.idx ?? ""}
          />
          <button type="submit" className="hidden">
            Submit
          </button>
        </label>
      </form>
    </Dialog>
  );
}

function IdxComponent({
  nodeId,
  parentId,
  value,
  doc,
}: {
  nodeId: string;
  parentId: string;
  value: unknown;
  doc: ClientDoc | ServerDoc;
}) {
  let onChange =
    doc instanceof ClientDoc
      ? (value: unknown) =>
          doc.move(nodeId, {
            type: "_force",
            parent: parentId,
            idx: value as string,
          })
      : undefined;

  return (
    <PropComponentBase propKey={"idx"} value={value} onChange={onChange} />
  );
}

function PropComponent({
  nodeId,
  propKey,
  value,
  doc,
}: {
  nodeId: string;
  propKey: string;
  value: unknown;
  doc: ClientDoc | ServerDoc;
}) {
  let onChange =
    doc instanceof ClientDoc
      ? (value: unknown) => doc.set(nodeId, propKey, value)
      : undefined;

  return (
    <PropComponentBase propKey={propKey} value={value} onChange={onChange} />
  );
}

function PropComponentBase({
  propKey,
  value,
  onChange,
}: {
  propKey: string;
  value: unknown;
  onChange?: (_: unknown) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    if (inputRef.current) {
      inputRef.current.value = JSON.stringify(value);
    }
  }, [value]);

  return (
    <li className="flex gap-1 mb-1 max-w-full">
      <span className="w-16 min-w-16 truncate">{propKey}</span>
      <span className="flex-grow flex flex-col max-w-full">
        <input
          ref={inputRef}
          className="font-mono text-xs bg-gray-100 border border-gray-300 rounded px-1 py-0.5"
          defaultValue={JSON.stringify(value)}
          readOnly={!onChange}
          onChange={(e) => {
            if (!onChange) return;
            setError(null);
            let value: unknown;
            try {
              value = JSON.parse(e.target.value);
            } catch (err) {
              setError(err!.toString());
              return;
            }
            onChange(value);
          }}
        />
        {error && <div className="text-xs text-red-600">{error}</div>}
      </span>
    </li>
  );
}
