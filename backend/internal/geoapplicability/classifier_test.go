package geoapplicability

import (
	"encoding/json"
	"testing"
)

func geometry(kind, coordinates string) (*string, json.RawMessage) {
	return &kind, json.RawMessage(`{"type":"` + kind + `","coordinates":` + coordinates + `}`)
}

func TestEvaluatePolygonSemantics(t *testing.T) {
	t.Parallel()
	kind, square := geometry("Polygon", `[[[0,0],[4,0],[4,4],[0,4],[0,0]]]`)
	_, hole := geometry("Polygon", `[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[1,3],[3,3],[3,1],[1,1]]]`)
	cases := []struct {
		name, status string
		kind         *string
		shape        json.RawMessage
		point        Point
		want         Evaluation
	}{
		{"inside", "valid", kind, square, Point{"2", "2"}, Evaluation{ResultInside, ReasonStrictInterior}},
		{"outside", "valid", kind, square, Point{"5", "2"}, Evaluation{ResultOutside, ReasonStrictExterior}},
		{"shell boundary", "valid", kind, square, Point{"4", "2"}, Evaluation{ResultUnknown, ReasonBoundary}},
		{"hole outside", "valid", kind, hole, Point{"2", "2"}, Evaluation{ResultOutside, ReasonStrictExterior}},
		{"hole boundary", "valid", kind, hole, Point{"1", "2"}, Evaluation{ResultUnknown, ReasonBoundary}},
		{"bad point", "valid", kind, square, Point{"NaN", "2"}, Evaluation{ResultUnknown, ReasonBadPoint}},
		{"noncanonical point", "valid", kind, square, Point{"01", "2"}, Evaluation{ResultUnknown, ReasonBadPoint}},
		{"no polygon", "absent", nil, nil, Point{"2", "2"}, Evaluation{ResultUnknown, ReasonNoPolygon}},
		{"unsupported", "unsupported", nil, nil, Point{"2", "2"}, Evaluation{ResultUnknown, ReasonUnsupported}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if got := Evaluate(test.status, test.kind, test.shape, test.point); got != test.want {
				t.Fatalf("Evaluate() = %#v, want %#v", got, test.want)
			}
		})
	}
}

func TestEvaluateMultiPolygonPrecedenceAndWholeValidation(t *testing.T) {
	t.Parallel()
	kind, valid := geometry("MultiPolygon", `[
		[[[0,0],[2,0],[2,2],[0,2],[0,0]]],
		[[[4,0],[6,0],[6,2],[4,2],[4,0]]]
	]`)
	_, invalidOther := geometry("MultiPolygon", `[
		[[[0,0],[2,0],[2,2],[0,2],[0,0]]],
		[[[4,0],[6,2],[4,2],[6,0],[4,0]]]
	]`)
	for _, test := range []struct {
		name  string
		shape json.RawMessage
		point Point
		want  Evaluation
	}{
		{"any interior wins", valid, Point{"1", "1"}, Evaluation{ResultInside, ReasonStrictInterior}},
		{"boundary otherwise unknown", valid, Point{"4", "1"}, Evaluation{ResultUnknown, ReasonBoundary}},
		{"otherwise outside", valid, Point{"3", "1"}, Evaluation{ResultOutside, ReasonStrictExterior}},
		{"invalid member invalidates all", invalidOther, Point{"1", "1"}, Evaluation{ResultUnknown, ReasonInvalidTopology}},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if got := Evaluate("valid", kind, test.shape, test.point); got != test.want {
				t.Fatalf("Evaluate() = %#v, want %#v", got, test.want)
			}
		})
	}
}

func TestInvalidTopologyPairs(t *testing.T) {
	t.Parallel()
	kind := "Polygon"
	cases := []struct {
		name, invalid, valid string
	}{
		{"unclosed", `[[[0,0],[4,0],[4,4],[0,4]]]`, `[[[0,0],[4,0],[4,4],[0,4],[0,0]]]`},
		{"fewer distinct", `[[[0,0],[1,0],[0,0],[0,0]]]`, `[[[0,0],[1,0],[0,1],[0,0]]]`},
		{"zero area", `[[[0,0],[1,0],[2,0],[0,0]]]`, `[[[0,0],[1,0],[1,1],[0,0]]]`},
		{"self intersection", `[[[0,0],[4,4],[0,4],[4,0],[0,0]]]`, `[[[0,0],[4,0],[4,4],[0,4],[0,0]]]`},
		{"self touch", `[[[0,0],[4,0],[2,2],[4,4],[0,4],[2,2],[0,0]]]`, `[[[0,0],[4,0],[4,4],[0,4],[0,0]]]`},
		{"spike", `[[[0,0],[4,0],[2,2],[4,0],[4,4],[0,4],[0,0]]]`, `[[[0,0],[4,0],[4,4],[0,4],[0,0]]]`},
		{"hole outside", `[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[5,1],[6,1],[6,2],[5,2],[5,1]]]`, `[[[0,0],[7,0],[7,4],[0,4],[0,0]],[[5,1],[6,1],[6,2],[5,2],[5,1]]]`},
		{"hole touches shell", `[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[0,1],[1,1],[1,2],[0,2],[0,1]]]`, `[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[2,1],[2,2],[1,2],[1,1]]]`},
		{"holes overlap", `[[[0,0],[6,0],[6,6],[0,6],[0,0]],[[1,1],[4,1],[4,4],[1,4],[1,1]],[[3,3],[5,3],[5,5],[3,5],[3,3]]]`, `[[[0,0],[6,0],[6,6],[0,6],[0,0]],[[1,1],[2,1],[2,2],[1,2],[1,1]],[[3,3],[5,3],[5,5],[3,5],[3,3]]]`},
		{"holes touch", `[[[0,0],[6,0],[6,6],[0,6],[0,0]],[[1,1],[3,1],[3,3],[1,3],[1,1]],[[3,1],[5,1],[5,3],[3,3],[3,1]]]`, `[[[0,0],[6,0],[6,6],[0,6],[0,0]],[[1,1],[2,1],[2,2],[1,2],[1,1]],[[3,1],[5,1],[5,3],[3,3],[3,1]]]`},
		{"longitude span", `[[[-170,0],[170,0],[170,2],[-170,2],[-170,0]]]`, `[[[170,0],[180,0],[180,2],[170,2],[170,0]]]`},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, invalid := geometry(kind, test.invalid)
			if got := Evaluate("valid", &kind, invalid, Point{"0.5", "0.5"}); got.Reason != ReasonInvalidTopology {
				t.Fatalf("invalid fixture classified as %#v", got)
			}
			_, valid := geometry(kind, test.valid)
			if got := Evaluate("valid", &kind, valid, Point{"0.5", "0.5"}); got.Reason == ReasonInvalidTopology {
				t.Fatalf("minimally different valid fixture rejected: %#v", got)
			}
		})
	}
}

func TestMultiPolygonOverlapAndInvariance(t *testing.T) {
	t.Parallel()
	kind := "MultiPolygon"
	_, overlap := geometry(kind, `[
		[[[0,0],[4,0],[4,4],[0,4],[0,0]]],
		[[[2,2],[6,2],[6,6],[2,6],[2,2]]]
	]`)
	if got := Evaluate("valid", &kind, overlap, Point{"1", "1"}); got.Reason != ReasonInvalidTopology {
		t.Fatalf("overlap classified as %#v", got)
	}
	for name, coordinates := range map[string]string{
		"collinear overlap": `[
			[[[0,0],[4,0],[4,4],[0,4],[0,0]]],
			[[[2,0],[6,0],[6,4],[2,4],[2,0]]]
		]`,
		"same shell subdivided": `[
			[[[0,0],[4,0],[4,4],[0,4],[0,0]]],
			[[[0,0],[2,0],[4,0],[4,4],[0,4],[0,0]]]
		]`,
		"inner diamond vertices on boundary": `[
			[[[0,0],[4,0],[4,4],[0,4],[0,0]]],
			[[[2,0],[4,2],[2,4],[0,2],[2,0]]]
		]`,
		"outer diamond through corners": `[
			[[[0,0],[4,0],[4,4],[0,4],[0,0]]],
			[[[2,-2],[6,2],[2,6],[-2,2],[2,-2]]]
		]`,
		"triangle vertices on boundary": `[
			[[[0,0],[4,0],[4,4],[0,4],[0,0]]],
			[[[2,0],[4,2],[0,2],[2,0]]]
		]`,
		"reordered reversed inner diamond": `[
			[[[2,0],[0,2],[2,4],[4,2],[2,0]]],
			[[[4,4],[0,4],[0,0],[4,0],[4,4]]]
		]`,
	} {
		t.Run(name, func(t *testing.T) {
			_, shape := geometry(kind, coordinates)
			if got := Evaluate("valid", &kind, shape, Point{"1", "1"}); got.Reason != ReasonInvalidTopology {
				t.Fatalf("collinear overlap classified as %#v", got)
			}
		})
	}
	_, adjacent := geometry(kind, `[
		[[[0,0],[2,0],[2,2],[0,2],[0,0]]],
		[[[2,0],[4,0],[4,2],[2,2],[2,0]]]
	]`)
	if got := Evaluate("valid", &kind, adjacent, Point{"1", "1"}); got != (Evaluation{ResultInside, ReasonStrictInterior}) {
		t.Fatalf("adjacent touching members classified as %#v", got)
	}
	_, adjacentReversed := geometry(kind, `[
		[[[0,0],[2,0],[2,2],[0,2],[0,0]]],
		[[[2,0],[2,2],[4,2],[4,0],[2,0]]]
	]`)
	if got := Evaluate("valid", &kind, adjacentReversed, Point{"1", "1"}); got != (Evaluation{ResultInside, ReasonStrictInterior}) {
		t.Fatalf("reversed adjacent touching members classified as %#v", got)
	}
	variants := []string{
		`[[[[0,0],[4,0],[4,4],[0,4],[0,0]]],[[[6,0],[8,0],[8,2],[6,2],[6,0]]]]`,
		`[[[[4,4],[0,4],[0,0],[4,0],[4,4]]],[[[8,2],[6,2],[6,0],[8,0],[8,2]]]]`,
		`[[[[6,0],[8,0],[8,2],[6,2],[6,0]]],[[[0,0],[0,0],[4,0],[4,4],[0,4],[0,0]]]]`,
	}
	for _, raw := range variants {
		_, shape := geometry(kind, raw)
		if got := Evaluate("valid", &kind, shape, Point{"1e0", "1.000"}); got != (Evaluation{ResultInside, ReasonStrictInterior}) {
			t.Fatalf("invariant variant classified as %#v", got)
		}
	}
}

func TestExactNearBoundaryMatrix(t *testing.T) {
	t.Parallel()
	kind, shape := geometry("Polygon", `[[[0,0],[1,0],[1,1],[0,1],[0,0]]]`)
	for _, test := range []struct {
		point Point
		want  Evaluation
	}{
		{Point{"0.999999999999999999999999999999999999", "0.5"}, Evaluation{ResultInside, ReasonStrictInterior}},
		{Point{"1", "0.5"}, Evaluation{ResultUnknown, ReasonBoundary}},
		{Point{"1.000000000000000000000000000000000001", "0.5"}, Evaluation{ResultOutside, ReasonStrictExterior}},
	} {
		if got := Evaluate("valid", kind, shape, test.point); got != test.want {
			t.Fatalf("%s classified as %#v, want %#v", test.point.Longitude, got, test.want)
		}
	}
}
