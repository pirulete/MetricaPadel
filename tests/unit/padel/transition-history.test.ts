/**
 * Unit tests del historial undo/redo por snapshots
 * (lib/padel/court/history.ts, EC-01/AC-06).
 * @jest-environment node
 */
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  commit,
  createHistory,
  redo,
  undo,
  type HistoryState,
} from "@/lib/padel/court/history";

describe("createHistory / commit", () => {
  it("arranca con un único presente y pilas vacías", () => {
    const history = createHistory({ v: 1 });
    expect(history).toEqual({ present: { v: 1 }, past: [], future: [] });
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it("apila el presente anterior y descarta el futuro", () => {
    let history = createHistory("a");
    history = commit(history, "b");
    history = commit(history, "c");
    expect(history.present).toBe("c");
    expect(history.past).toEqual(["a", "b"]);
    expect(history.future).toEqual([]);

    history = undo(history);
    expect(canRedo(history)).toBe(true);
    history = commit(history, "b2");
    expect(history.present).toBe("b2");
    expect(history.past).toEqual(["a", "b"]);
    expect(history.future).toEqual([]);
  });

  it("commit del mismo objeto es un no-op por identidad (no re-render)", () => {
    const present = { v: 1 };
    const history = createHistory(present);
    expect(commit(history, present)).toBe(history);
  });

  it("respeta HISTORY_LIMIT descartando los snapshots más antiguos", () => {
    let history: HistoryState<number> = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) history = commit(history, i);

    expect(HISTORY_LIMIT).toBe(50);
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]).toBe(10);
    expect(history.past[history.past.length - 1]).toBe(HISTORY_LIMIT + 9);
    expect(history.present).toBe(HISTORY_LIMIT + 10);
  });

  it("no muta el historial de entrada", () => {
    const history = commit(createHistory("a"), "b");
    const snapshot = JSON.stringify(history);
    undo(history);
    redo(history);
    commit(history, "c");
    expect(JSON.stringify(history)).toBe(snapshot);
  });
});

describe("undo / redo", () => {
  it("undo y redo son inversos", () => {
    const history = commit(commit(createHistory("a"), "b"), "c");

    const undone = undo(history);
    expect(undone.present).toBe("b");
    expect(undone.future).toEqual(["c"]);

    const redone = redo(undone);
    expect(redone.present).toBe("c");
    expect(redone.future).toEqual([]);
    expect(redone.past).toEqual(["a", "b"]);
  });

  it("undo/redo sin entradas devuelven el MISMO estado (identidad)", () => {
    const empty = createHistory("a");
    expect(undo(empty)).toBe(empty);
    expect(redo(empty)).toBe(empty);

    const onlyFutureCleared: HistoryState<string> = { present: "a", past: [], future: [] };
    expect(canUndo(onlyFutureCleared)).toBe(false);
    expect(canRedo(onlyFutureCleared)).toBe(false);
    expect(undo(onlyFutureCleared)).toBe(onlyFutureCleared);
    expect(redo(onlyFutureCleared)).toBe(onlyFutureCleared);
  });

  it("undo completo deja el estado inicial y redo lo reconstruye", () => {
    const start = createHistory(0);
    let history = commit(start, 1);
    history = commit(history, 2);

    history = undo(undo(history));
    expect(history.present).toBe(0);
    expect(canUndo(history)).toBe(false);
    expect(history.future).toEqual([2, 1]);

    history = redo(history);
    history = redo(history);
    expect(history.present).toBe(2);
    expect(canRedo(history)).toBe(false);
  });

  it("un commit nuevo limpia la pila de rehacer", () => {
    let history = commit(commit(createHistory("a"), "b"), "c");
    history = undo(history);
    history = undo(history);
    expect(history.future).toHaveLength(2);

    history = commit(history, "d");
    expect(history.present).toBe("d");
    expect(history.future).toEqual([]);
    expect(canRedo(history)).toBe(false);
    expect(history.past).toEqual(["a"]);
  });

  it("canUndo/canRedo reflejan el contenido de las pilas", () => {
    const history = createHistory("a");
    expect([canUndo(history), canRedo(history)]).toEqual([false, false]);

    const afterCommit = commit(history, "b");
    expect([canUndo(afterCommit), canRedo(afterCommit)]).toEqual([true, false]);

    const afterUndo = undo(afterCommit);
    expect([canUndo(afterUndo), canRedo(afterUndo)]).toEqual([false, true]);
  });
});
