package io.xaiop;

import static io.xaiop.Fixtures.list;
import static io.xaiop.Fixtures.map;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.xaiop.stream.DotCheckpointEngine;
import io.xaiop.stream.Materialize;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Protocol 0.7.0 Draft — array element select {@code ?} and bare {@code &}. */
class ArraySelectTest {

  private static String wire(String... lines) {
    return String.join("\n", lines);
  }

  @Test
  void indexThenWrite() {
    assertEquals(
        map(
            "orders",
            list(map("id", "A1"), map("id", "A2", "status", "shipped"))),
        Parse.parse(
            wire(">", ">orders-", "id:A1", "id:A2", ".", "@orders", "?1", "status:shipped")));
  }

  @Test
  void predicateFirstMatch() {
    assertEquals(
        map(
            "orders",
            list(map("id", "A1"), map("id", "A2", "status", "shipped"))),
        Parse.parse(
            wire(">", ">orders-", "id:A1", "id:A2", ".", "@orders", "?id:A2", "status:shipped")));
  }

  @Test
  void starPredicate() {
    assertEquals(
        map(
            "orders",
            list(
                map("id", "A1", "status", "pending", "checked", true),
                map("id", "A2", "status", "pending", "checked", true),
                map("id", "A3", "status", "done"))),
        Parse.parse(
            wire(
                ">",
                ">orders-",
                ">",
                "id:A1",
                "status:pending",
                "<",
                ">",
                "id:A2",
                "status:pending",
                "<",
                ">",
                "id:A3",
                "status:done",
                ".",
                "@orders",
                "?*status:pending",
                "checked:true")));
  }

  @Test
  void bareAmpAfterEnter() {
    assertEquals(
        map("items", list(map("id", "keep"))),
        Parse.parse(wire(">", ">items-", ">", "id:keep", "<", ">", "id:drop", "&")));
  }

  @Test
  void bareAmpAfterPredicate() {
    assertEquals(
        map("orders", list(map("id", "A1"), map("id", "A3"))),
        Parse.parse(
            wire(">", ">orders-", "id:A1", "id:A2", "id:A3", ".", "@orders", "?id:A2", "&")));
  }

  @Test
  void starThenAmpClears() {
    assertEquals(
        map("orders", list()),
        Parse.parse(wire(">", ">orders-", "id:A1", "id:A2", ".", "@orders", "?*", "&")));
  }

  @Test
  void scalarIndexDelete() {
    assertEquals(
        map("n", list("a", "c")),
        Parse.parse(wire(">", ">n-", ":a", ":b", ":c", ".", "@n", "?1", "&")));
  }

  @Test
  void nestedArrayAppend() {
    assertEquals(
        map("wrap", list(list("a", "b", "c"))),
        Parse.parse(wire(">", ">wrap-", "-", ":a", ":b", ".", "@wrap", "?0", ":c")));
  }

  @Test
  void numericBoolForcedEscape() {
    assertEquals(
        map("rows", list(map("n", 1, "hit", true), map("n", 2))),
        Parse.parse(wire(">", ">rows-", "n:1", "n:2", ".", "@rows", "?n:1", "hit:true")));
    assertEquals(
        map("rows", list(map("ok", true, "x", 1), map("ok", false))),
        Parse.parse(wire(">", ">rows-", "ok:true", "ok:false", ".", "@rows", "?ok:true", "x:1")));
    assertEquals(
        map("rows", list(map("id", "1", "hit", true), map("id", 2))),
        Parse.parse(wire(">", ">rows-", "id: 1", "id:2", ".", "@rows", "?id: 1", "hit:true")));
    assertEquals(
        map("rows", list(map("t", "a\nb", "hit", true), map("t", "plain"))),
        Parse.parse(
            wire(">", ">rows-", "t:a\\nb", "t:plain", ".", "@rows", "?t:a\\nb", "hit:true")));
  }

  @Test
  void rootArray() {
    Object got = Parse.parse(wire("-", "id:A", "id:B", "?1", "x:1"));
    assertEquals(list(map("id", "A"), map("id", "B", "x", 1)), Materialize.materializeSnapshot(got));
  }

  @Test
  void liveChunks() {
    Parse.LiveXaiopParser live = new Parse.LiveXaiopParser();
    live.feedText(">\n>orders-\nid:A1\nid:A2\n.\n");
    live.feedText("@orders\n?id:A2\nstatus:ok\n");
    assertEquals(
        map("orders", list(map("id", "A1"), map("id", "A2", "status", "ok"))),
        Materialize.materializeSnapshot(live.value()));
  }

  @Test
  void errors() {
    List<String> fails =
        List.of(
            wire(">", "?0"),
            wire(">", ">a", "x:1", "?0"),
            wire(">", ">n-", ":a", ".", "@n", "?"),
            wire(">", ">n-", ":a", ".", "@n", "?9"),
            wire(">", ">n-", "id:A", ".", "@n", "?id:Z"),
            wire(">", ">n-", ".", "@n", "?*"),
            wire(">", ">n-", ":a", ".", "@n", "?01"),
            wire(">", ">n-", ":a", ".", "@n", "?00"),
            wire(">", ">n-", ":a", ".", "@n", "?-1"),
            wire(">", ">n-", ":a", ".", "@n", "?*2"),
            wire(">", ">n-", ":a", ".", "@n", "?:x"),
            wire(">", ">n-", ":a", ".", "@n", "?0", "k:v"),
            wire(">", ">a", "x:1", ".", "!a", "?0"),
            wire(">", "&"),
            wire(">", ">n-", ":a", ".", "@n", "&"),
            wire(">", ">n-", ":a", ":b", ".", "@n", "?*", "?0"),
            wire(">", ">n-", ":a", ":b", ".", "@n", "?0", "?0"),
            wire(">", ">n-", ":a", ":b", ".", "@n", "?id:A"),
            wire(">", ">rows-", "ok:1", ".", "@rows", "?ok:true"),
            wire(">", ">n-", ":a", ":b", ".", "@n", "? 1"),
            wire(">", ">n-", ":a", ".", "@n", "?+1"),
            wire(">", ">n-", ":a", ":b", ".", "@n", "?1.5"));
    for (String src : fails) {
      assertThrows(XaiopSyntaxError.class, () -> Parse.parse(src), src);
    }
    assertInstanceOf(XaiopSyntaxError.class, assertThrows(XaiopSyntaxError.class, () -> Parse.parse(wire(">", "?0"))));
  }

  @Test
  void atMidPathArrayBecomesObjectKey() {
    assertEquals(
        map("orders", map("0", map("x", 1))),
        Parse.parse(wire(">", ">orders-", "id:A1", ".", "@orders>0", "x:1")));
  }

  @Test
  void ampPathDoesNotWalkArrayIndex() {
    assertEquals(
        map("orders", list(map("id", "A1"), map("id", "A2"))),
        Parse.parse(wire(">", ">orders-", "id:A1", "id:A2", ".", "&orders>0")));
  }

  @Test
  void starThenAmpPathDeletesKeys() {
    assertEquals(
        map("orders", list(map("id", "A1"), map("id", "A2"))),
        Parse.parse(
            wire(
                ">",
                ">orders-",
                ">",
                "id:A1",
                "status:pending",
                "<",
                ">",
                "id:A2",
                "status:pending",
                ".",
                "@orders",
                "?*",
                "&status")));
  }

  @Test
  void eqThenIndex() {
    assertEquals(
        map("orders", list(map("id", "A1"), map("id", "A2", "status", "ok"))),
        Parse.parse(wire(">", ">orders-", "id:A1", "id:A2", ".", "=orders", "?1", "status:ok")));
  }

  @Test
  void streamReenterThenSelect() {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .streamProcessing(true)
            .mergeChunkWindow(false)
            .cover(false)
            .onChunk(d -> {})
            .build();
    eng.push(wire(">", ">orders-", "id:A1", "id:A2", ".") + "\n");
    eng.push(wire(">orders-", "?1", "status:ok", ".") + "\n");
    eng.finish();
    assertEquals(
        map("orders", list(map("id", "A1"), map("id", "A2", "status", "ok"))),
        eng.snapshot());
  }
}
