import { useEffect, useState, type FormEvent } from "react";
import type { Selection } from "./App";
import type { ReferenceCollection } from "./reference";

type Bbox = [number, number, number, number];
type Props = {
  siteId: string;
  reference: ReferenceCollection | null;
  onFound: (s: Selection, bbox: Bbox) => void;
};

/** Header box: a reference field id (p36) or a segment id (cc20456) of the current site. */
export default function FindField({ siteId, reference, onFound }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "searching" | "not-found">("idle");

  useEffect(() => setStatus("idle"), [siteId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const id = query.trim().toLowerCase();
    if (!id) return;
    const field = reference?.features.find((f) => f.properties.field_id.toLowerCase() === id);
    if (field) {
      setStatus("idle");
      onFound({ kind: "reference", id: field.properties.field_id }, field.properties.bbox);
      return;
    }
    setStatus("searching");
    try {
      const r = await fetch(`/api/segments/${siteId}/${encodeURIComponent(id)}`);
      if (!r.ok) return setStatus("not-found");
      const seg: { segment_id: string; bbox: Bbox } = await r.json();
      setStatus("idle");
      onFound({ kind: "segment", id: seg.segment_id }, seg.bbox);
    } catch {
      setStatus("not-found");
    }
  };

  return (
    <form className="find" role="search" onSubmit={submit} data-testid="find-field">
      <input
        type="search"
        aria-label="Find field"
        placeholder="Find field (p36, cc20456)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (status === "not-found") setStatus("idle");
        }}
      />
      <button type="submit" disabled={status === "searching"}>
        Find
      </button>
      {status === "not-found" && (
        <span className="find-status" role="status" data-testid="find-status">
          Not found
        </span>
      )}
    </form>
  );
}
