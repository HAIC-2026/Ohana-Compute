package geoapplicability

import (
	"bytes"
	"encoding/json"
	"errors"
	"math/big"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

const AlgorithmVersion = "rfc7946-planar-rational-v1"
const DefaultValidationWork = 5_000_000

const (
	ResultInside  = "inside"
	ResultOutside = "outside"
	ResultUnknown = "unknown"

	ReasonStrictInterior  = "strict_interior"
	ReasonStrictExterior  = "strict_exterior"
	ReasonNoPolygon       = "no_polygon"
	ReasonBoundary        = "boundary"
	ReasonInvalidTopology = "invalid_topology"
	ReasonBadPoint        = "bad_point"
	ReasonUnsupported     = "unsupported"
)

var decimalPattern = regexp.MustCompile(`^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$`)
var ErrTooComplex = errors.New("geometry validation work limit exceeded")

type Point struct {
	Longitude string
	Latitude  string
}

type Evaluation struct {
	Result string
	Reason string
}

type Prepared struct {
	polygons []polygon
	bounds   []bounds
}

type bounds struct {
	minX *big.Rat
	maxX *big.Rat
	minY *big.Rat
	maxY *big.Rat
}

type validationBudget struct {
	remaining int
}

func (budget *validationBudget) spend() error {
	if budget == nil {
		return nil
	}
	if budget.remaining <= 0 {
		return ErrTooComplex
	}
	budget.remaining--
	return nil
}

func ValidPoint(candidate Point) bool {
	_, err := parsePoint(candidate.Longitude, candidate.Latitude)
	return err == nil
}

type point struct {
	x *big.Rat
	y *big.Rat
}

type ring []point
type polygon []ring

func Evaluate(status string, geometryType *string, shape json.RawMessage, candidate Point) Evaluation {
	switch status {
	case "absent":
		return Evaluation{Result: ResultUnknown, Reason: ReasonNoPolygon}
	case "unsupported", "too_large":
		return Evaluation{Result: ResultUnknown, Reason: ReasonUnsupported}
	case "valid":
	default:
		return Evaluation{Result: ResultUnknown, Reason: ReasonInvalidTopology}
	}
	if geometryType == nil || (*geometryType != "Polygon" && *geometryType != "MultiPolygon") {
		return Evaluation{Result: ResultUnknown, Reason: ReasonUnsupported}
	}
	prepared, err := Prepare(*geometryType, shape, DefaultValidationWork)
	if err != nil {
		return Evaluation{Result: ResultUnknown, Reason: ReasonInvalidTopology}
	}
	return prepared.Evaluate(candidate)
}

func Prepare(geometryType string, shape json.RawMessage, maximumWork int) (*Prepared, error) {
	return PrepareWithBudget(geometryType, shape, NewValidationBudget(maximumWork))
}

func NewValidationBudget(maximumWork int) *validationBudget {
	return &validationBudget{remaining: maximumWork}
}

func PrepareWithBudget(
	geometryType string,
	shape json.RawMessage,
	budget *validationBudget,
) (*Prepared, error) {
	if geometryType != "Polygon" && geometryType != "MultiPolygon" {
		return nil, errors.New("unsupported geometry")
	}
	polygons, err := decodeGeometry(geometryType, shape)
	if err != nil {
		return nil, err
	}
	if budget == nil || budget.remaining <= 0 {
		return nil, ErrTooComplex
	}
	if err := validateGeometry(polygons, budget); err != nil {
		return nil, err
	}
	boxes := make([]bounds, len(polygons))
	for index, item := range polygons {
		boxes[index] = ringBounds(item[0])
	}
	return &Prepared{polygons: polygons, bounds: boxes}, nil
}

func (prepared *Prepared) Evaluate(candidate Point) Evaluation {
	query, err := parsePoint(candidate.Longitude, candidate.Latitude)
	if err != nil {
		return Evaluation{Result: ResultUnknown, Reason: ReasonBadPoint}
	}
	boundary := false
	for index, item := range prepared.polygons {
		if !prepared.bounds[index].contains(query) {
			continue
		}
		location := locatePolygon(query, item)
		if location == ResultInside {
			return Evaluation{Result: ResultInside, Reason: ReasonStrictInterior}
		}
		if location == ReasonBoundary {
			boundary = true
		}
	}
	if boundary {
		return Evaluation{Result: ResultUnknown, Reason: ReasonBoundary}
	}
	return Evaluation{Result: ResultOutside, Reason: ReasonStrictExterior}
}

func parsePoint(longitude, latitude string) (point, error) {
	x, err := parseDecimal(longitude)
	if err != nil || x.Cmp(big.NewRat(-180, 1)) < 0 || x.Cmp(big.NewRat(180, 1)) > 0 {
		return point{}, errors.New("invalid longitude")
	}
	y, err := parseDecimal(latitude)
	if err != nil || y.Cmp(big.NewRat(-90, 1)) < 0 || y.Cmp(big.NewRat(90, 1)) > 0 {
		return point{}, errors.New("invalid latitude")
	}
	return point{x: x, y: y}, nil
}

func parseDecimal(value string) (*big.Rat, error) {
	if value == "" || len(value) > 128 || !decimalPattern.MatchString(value) {
		return nil, errors.New("invalid decimal")
	}
	sign := 1
	if value[0] == '-' {
		sign = -1
		value = value[1:]
	}
	parts := strings.SplitN(value, "e", 2)
	if len(parts) == 1 {
		parts = strings.SplitN(value, "E", 2)
	}
	mantissa := parts[0]
	exponent := 0
	if len(parts) == 2 {
		parsed, err := strconv.Atoi(parts[1])
		if err != nil || parsed < -1000 || parsed > 1000 {
			return nil, errors.New("invalid exponent")
		}
		exponent = parsed
	}
	decimal := strings.SplitN(mantissa, ".", 2)
	if len(decimal) > 2 || decimal[0] == "" {
		return nil, errors.New("invalid mantissa")
	}
	fraction := ""
	if len(decimal) == 2 {
		fraction = decimal[1]
		if fraction == "" {
			return nil, errors.New("invalid fraction")
		}
	}
	digits := decimal[0] + fraction
	for _, digit := range digits {
		if digit < '0' || digit > '9' {
			return nil, errors.New("invalid digit")
		}
	}
	numerator := new(big.Int)
	if _, ok := numerator.SetString(digits, 10); !ok {
		return nil, errors.New("invalid integer")
	}
	if sign < 0 {
		numerator.Neg(numerator)
	}
	scale := len(fraction) - exponent
	if scale < 0 {
		numerator.Mul(numerator, pow10(-scale))
		scale = 0
	}
	return new(big.Rat).SetFrac(numerator, pow10(scale)), nil
}

func pow10(exponent int) *big.Int {
	return new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(exponent)), nil)
}

func decodeGeometry(geometryType string, shape json.RawMessage) ([]polygon, error) {
	var envelope struct {
		Type        string          `json:"type"`
		Coordinates json.RawMessage `json:"coordinates"`
	}
	decoder := json.NewDecoder(bytes.NewReader(shape))
	decoder.UseNumber()
	if decoder.Decode(&envelope) != nil || envelope.Type != geometryType || len(envelope.Coordinates) == 0 {
		return nil, errors.New("malformed geometry")
	}
	if decoder.Decode(&struct{}{}) == nil {
		return nil, errors.New("trailing geometry")
	}
	var raw [][][][]json.Number
	if geometryType == "Polygon" {
		var item [][][]json.Number
		if decodeNumbers(envelope.Coordinates, &item) != nil {
			return nil, errors.New("malformed polygon")
		}
		raw = [][][][]json.Number{item}
	} else {
		if decodeNumbers(envelope.Coordinates, &raw) != nil {
			return nil, errors.New("malformed multipolygon")
		}
	}
	polygons := make([]polygon, len(raw))
	for polygonIndex, rawPolygon := range raw {
		polygons[polygonIndex] = make(polygon, len(rawPolygon))
		for ringIndex, rawRing := range rawPolygon {
			parsed := make(ring, len(rawRing))
			for pointIndex, rawPoint := range rawRing {
				if len(rawPoint) != 2 {
					return nil, errors.New("invalid position")
				}
				value, err := parsePoint(rawPoint[0].String(), rawPoint[1].String())
				if err != nil {
					return nil, err
				}
				parsed[pointIndex] = value
			}
			polygons[polygonIndex][ringIndex] = normalizeRing(parsed)
		}
	}
	return polygons, nil
}

func decodeNumbers(raw json.RawMessage, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if decoder.Decode(&struct{}{}) == nil {
		return errors.New("trailing coordinates")
	}
	return nil
}

func normalizeRing(value ring) ring {
	if len(value) == 0 {
		return value
	}
	result := make(ring, 0, len(value))
	for _, item := range value {
		if len(result) == 0 || !equalPoint(result[len(result)-1], item) {
			result = append(result, item)
		}
	}
	return result
}

func validateGeometry(polygons []polygon, budget *validationBudget) error {
	if len(polygons) == 0 {
		return errors.New("empty geometry")
	}
	for _, item := range polygons {
		if err := validatePolygon(item, budget); err != nil {
			return err
		}
	}
	for left := range polygons {
		for right := left + 1; right < len(polygons); right++ {
			overlap, err := polygonsOverlap(polygons[left], polygons[right], budget)
			if err != nil {
				return err
			}
			if overlap {
				return errors.New("overlapping multipolygon members")
			}
		}
	}
	return nil
}

func validatePolygon(value polygon, budget *validationBudget) error {
	if len(value) == 0 {
		return errors.New("empty polygon")
	}
	for _, item := range value {
		if err := validateRing(item, budget); err != nil {
			return err
		}
	}
	shell := value[0]
	for holeIndex, hole := range value[1:] {
		intersects, err := ringsIntersect(shell, hole, true, budget)
		if err != nil {
			return err
		}
		location, err := locateRingWithBudget(hole[0], shell, budget)
		if err != nil {
			return err
		}
		if location != ResultInside || intersects {
			return errors.New("hole is outside or touches shell")
		}
		for _, other := range value[1 : holeIndex+1] {
			overlap, err := ringsOverlapOrTouch(hole, other, budget)
			if err != nil {
				return err
			}
			if overlap {
				return errors.New("holes overlap or touch")
			}
		}
	}
	return nil
}

func validateRing(value ring, budget *validationBudget) error {
	if len(value) < 4 || !equalPoint(value[0], value[len(value)-1]) {
		return errors.New("ring is not closed")
	}
	vertices := value[:len(value)-1]
	if len(vertices) < 3 {
		return errors.New("fewer than three vertices")
	}
	distinct := map[string]struct{}{}
	for index, current := range vertices {
		distinct[pointKey(current)] = struct{}{}
		next := value[index+1]
		if absRat(new(big.Rat).Sub(current.x, next.x)).Cmp(big.NewRat(180, 1)) > 0 {
			return errors.New("edge spans more than 180 longitude")
		}
		if index > 0 && equalPoint(value[index-1], next) {
			return errors.New("backtracking spike")
		}
	}
	if len(distinct) < 3 || signedArea(value).Sign() == 0 {
		return errors.New("degenerate ring")
	}
	for left := 0; left < len(vertices); left++ {
		for right := left + 1; right < len(vertices); right++ {
			if right == left+1 || (left == 0 && right == len(vertices)-1) {
				continue
			}
			if err := budget.spend(); err != nil {
				return err
			}
			if !segmentBoundsOverlap(
				value[left],
				value[left+1],
				value[right],
				value[right+1],
			) {
				continue
			}
			if segmentsIntersect(value[left], value[left+1], value[right], value[right+1]) {
				return errors.New("self-intersection or self-touch")
			}
		}
	}
	return nil
}

func signedArea(value ring) *big.Rat {
	sum := new(big.Rat)
	for index := 0; index < len(value)-1; index++ {
		cross := new(big.Rat).Sub(
			new(big.Rat).Mul(value[index].x, value[index+1].y),
			new(big.Rat).Mul(value[index+1].x, value[index].y),
		)
		sum.Add(sum, cross)
	}
	return sum
}

func locatePolygon(candidate point, value polygon) string {
	shell := locateRing(candidate, value[0])
	if shell != ResultInside {
		return shell
	}
	for _, hole := range value[1:] {
		location := locateRing(candidate, hole)
		if location == ReasonBoundary {
			return ReasonBoundary
		}
		if location == ResultInside {
			return ResultOutside
		}
	}
	return ResultInside
}

func locateRing(candidate point, value ring) string {
	inside := false
	for index := 0; index < len(value)-1; index++ {
		start, end := value[index], value[index+1]
		if onSegment(start, candidate, end) {
			return ReasonBoundary
		}
		if (start.y.Cmp(candidate.y) > 0) == (end.y.Cmp(candidate.y) > 0) {
			continue
		}
		orientation := orient(start, end, candidate)
		if (end.y.Cmp(start.y) > 0 && orientation > 0) ||
			(end.y.Cmp(start.y) < 0 && orientation < 0) {
			inside = !inside
		}
	}
	if inside {
		return ResultInside
	}
	return ResultOutside
}

func locatePolygonWithBudget(
	candidate point,
	value polygon,
	budget *validationBudget,
) (string, error) {
	shell, err := locateRingWithBudget(candidate, value[0], budget)
	if err != nil || shell != ResultInside {
		return shell, err
	}
	for _, hole := range value[1:] {
		location, err := locateRingWithBudget(candidate, hole, budget)
		if err != nil {
			return ResultUnknown, err
		}
		if location == ReasonBoundary {
			return ReasonBoundary, nil
		}
		if location == ResultInside {
			return ResultOutside, nil
		}
	}
	return ResultInside, nil
}

func locateRingWithBudget(
	candidate point,
	value ring,
	budget *validationBudget,
) (string, error) {
	inside := false
	for index := 0; index < len(value)-1; index++ {
		if err := budget.spend(); err != nil {
			return ResultUnknown, err
		}
		start, end := value[index], value[index+1]
		if onSegment(start, candidate, end) {
			return ReasonBoundary, nil
		}
		if (start.y.Cmp(candidate.y) > 0) == (end.y.Cmp(candidate.y) > 0) {
			continue
		}
		orientation := orient(start, end, candidate)
		if (end.y.Cmp(start.y) > 0 && orientation > 0) ||
			(end.y.Cmp(start.y) < 0 && orientation < 0) {
			inside = !inside
		}
	}
	if inside {
		return ResultInside, nil
	}
	return ResultOutside, nil
}

func polygonsOverlap(left, right polygon, budget *validationBudget) (bool, error) {
	if err := budget.spend(); err != nil {
		return false, err
	}
	leftBounds := ringBounds(left[0])
	rightBounds := ringBounds(right[0])
	if !leftBounds.overlaps(rightBounds) {
		return false, nil
	}
	overlap, err := shellsOverlapCollinearly(left[0], right[0], budget)
	if err != nil || overlap {
		return overlap, err
	}
	for _, leftRing := range left {
		for _, rightRing := range right {
			intersects, err := ringsIntersect(leftRing, rightRing, false, budget)
			if err != nil || intersects {
				return intersects, err
			}
		}
	}
	enters, err := boundaryPiecesEnterPolygon(left, right, budget)
	if err != nil || enters {
		return enters, err
	}
	enters, err = boundaryPiecesEnterPolygon(right, left, budget)
	if err != nil || enters {
		return enters, err
	}
	for _, candidate := range left[0][:len(left[0])-1] {
		location, err := locatePolygonWithBudget(candidate, right, budget)
		if err != nil {
			return false, err
		}
		if location == ResultInside {
			return true, nil
		}
	}
	for _, candidate := range right[0][:len(right[0])-1] {
		location, err := locatePolygonWithBudget(candidate, left, budget)
		if err != nil {
			return false, err
		}
		if location == ResultInside {
			return true, nil
		}
	}
	if len(left[0]) != len(right[0]) || !leftBounds.equal(rightBounds) {
		return false, nil
	}
	return equalRing(left[0], right[0], budget)
}

func boundaryPiecesEnterPolygon(
	source,
	target polygon,
	budget *validationBudget,
) (bool, error) {
	targetVertices := make([]point, 0)
	for _, targetRing := range target {
		targetVertices = append(targetVertices, targetRing[:len(targetRing)-1]...)
	}
	targetBounds := ringBounds(target[0])
	for _, sourceRing := range source {
		for index := 0; index < len(sourceRing)-1; index++ {
			start, end := sourceRing[index], sourceRing[index+1]
			if !segmentOverlapsBounds(start, end, targetBounds) {
				continue
			}
			splits := []point{start, end}
			for _, candidate := range targetVertices {
				if err := budget.spend(); err != nil {
					return false, err
				}
				if !pointWithinSegmentBounds(candidate, start, end) {
					continue
				}
				if onSegment(start, candidate, end) {
					splits = append(splits, candidate)
				}
			}
			splits = sortedUniquePointsOnSegment(splits, start, end)
			for splitIndex := 0; splitIndex < len(splits)-1; splitIndex++ {
				midpoint := point{
					x: new(big.Rat).Quo(
						new(big.Rat).Add(splits[splitIndex].x, splits[splitIndex+1].x),
						big.NewRat(2, 1),
					),
					y: new(big.Rat).Quo(
						new(big.Rat).Add(splits[splitIndex].y, splits[splitIndex+1].y),
						big.NewRat(2, 1),
					),
				}
				location, err := locatePolygonWithBudget(midpoint, target, budget)
				if err != nil {
					return false, err
				}
				if location == ResultInside {
					return true, nil
				}
			}
		}
	}
	return false, nil
}

func sortedUniquePointsOnSegment(values []point, start, end point) []point {
	useX := start.x.Cmp(end.x) != 0
	sort.Slice(values, func(left, right int) bool {
		if useX {
			if comparison := values[left].x.Cmp(values[right].x); comparison != 0 {
				return comparison < 0
			}
			return values[left].y.Cmp(values[right].y) < 0
		}
		if comparison := values[left].y.Cmp(values[right].y); comparison != 0 {
			return comparison < 0
		}
		return values[left].x.Cmp(values[right].x) < 0
	})
	result := values[:0]
	for _, candidate := range values {
		if len(result) == 0 || !equalPoint(result[len(result)-1], candidate) {
			result = append(result, candidate)
		}
	}
	return result
}

func shellsOverlapCollinearly(
	left,
	right ring,
	budget *validationBudget,
) (bool, error) {
	if err := budget.spend(); err != nil {
		return false, err
	}
	if !ringBounds(left).overlaps(ringBounds(right)) {
		return false, nil
	}
	leftInterior := signedArea(left).Sign()
	rightInterior := signedArea(right).Sign()
	for leftIndex := 0; leftIndex < len(left)-1; leftIndex++ {
		for rightIndex := 0; rightIndex < len(right)-1; rightIndex++ {
			a, b := left[leftIndex], left[leftIndex+1]
			c, d := right[rightIndex], right[rightIndex+1]
			if err := budget.spend(); err != nil {
				return false, err
			}
			if !segmentBoundsOverlap(a, b, c, d) {
				continue
			}
			if orient(a, b, c) != 0 || orient(a, b, d) != 0 ||
				!segmentsOverlapWithLength(a, b, c, d) {
				continue
			}
			leftDX := new(big.Rat).Sub(b.x, a.x)
			leftDY := new(big.Rat).Sub(b.y, a.y)
			rightDX := new(big.Rat).Sub(d.x, c.x)
			rightDY := new(big.Rat).Sub(d.y, c.y)
			direction := new(big.Rat).Add(
				new(big.Rat).Mul(leftDX, rightDX),
				new(big.Rat).Mul(leftDY, rightDY),
			).Sign()
			if direction != 0 && leftInterior == rightInterior*direction {
				return true, nil
			}
		}
	}
	return false, nil
}

func segmentsOverlapWithLength(a, b, c, d point) bool {
	if a.x.Cmp(b.x) != 0 {
		return intervalOverlapWithLength(a.x, b.x, c.x, d.x)
	}
	return intervalOverlapWithLength(a.y, b.y, c.y, d.y)
}

func intervalOverlapWithLength(a, b, c, d *big.Rat) bool {
	left := maxRat(minRat(a, b), minRat(c, d))
	right := minRat(maxRat(a, b), maxRat(c, d))
	return left.Cmp(right) < 0
}

func ringBounds(value ring) bounds {
	result := bounds{
		minX: value[0].x,
		maxX: value[0].x,
		minY: value[0].y,
		maxY: value[0].y,
	}
	for _, candidate := range value[1:] {
		result.minX = minRat(result.minX, candidate.x)
		result.maxX = maxRat(result.maxX, candidate.x)
		result.minY = minRat(result.minY, candidate.y)
		result.maxY = maxRat(result.maxY, candidate.y)
	}
	return result
}

func (value bounds) overlaps(other bounds) bool {
	return value.minX.Cmp(other.maxX) <= 0 &&
		other.minX.Cmp(value.maxX) <= 0 &&
		value.minY.Cmp(other.maxY) <= 0 &&
		other.minY.Cmp(value.maxY) <= 0
}

func (value bounds) equal(other bounds) bool {
	return value.minX.Cmp(other.minX) == 0 &&
		value.maxX.Cmp(other.maxX) == 0 &&
		value.minY.Cmp(other.minY) == 0 &&
		value.maxY.Cmp(other.maxY) == 0
}

func (value bounds) contains(candidate point) bool {
	return between(candidate.x, value.minX, value.maxX) &&
		between(candidate.y, value.minY, value.maxY)
}

func segmentBoundsOverlap(a, b, c, d point) bool {
	return maxRat(minRat(a.x, b.x), minRat(c.x, d.x)).Cmp(
		minRat(maxRat(a.x, b.x), maxRat(c.x, d.x)),
	) <= 0 && maxRat(minRat(a.y, b.y), minRat(c.y, d.y)).Cmp(
		minRat(maxRat(a.y, b.y), maxRat(c.y, d.y)),
	) <= 0
}

func segmentOverlapsBounds(start, end point, target bounds) bool {
	return maxRat(minRat(start.x, end.x), target.minX).Cmp(
		minRat(maxRat(start.x, end.x), target.maxX),
	) <= 0 && maxRat(minRat(start.y, end.y), target.minY).Cmp(
		minRat(maxRat(start.y, end.y), target.maxY),
	) <= 0
}

func pointWithinSegmentBounds(candidate, start, end point) bool {
	return between(candidate.x, start.x, end.x) &&
		between(candidate.y, start.y, end.y)
}

func minRat(left, right *big.Rat) *big.Rat {
	if left.Cmp(right) <= 0 {
		return left
	}
	return right
}

func maxRat(left, right *big.Rat) *big.Rat {
	if left.Cmp(right) >= 0 {
		return left
	}
	return right
}

func ringsOverlapOrTouch(
	left,
	right ring,
	budget *validationBudget,
) (bool, error) {
	intersects, err := ringsIntersect(left, right, true, budget)
	if err != nil || intersects {
		return intersects, err
	}
	leftLocation, err := locateRingWithBudget(left[0], right, budget)
	if err != nil {
		return false, err
	}
	rightLocation, err := locateRingWithBudget(right[0], left, budget)
	if err != nil {
		return false, err
	}
	return leftLocation != ResultOutside || rightLocation != ResultOutside, nil
}

func ringsIntersect(
	left,
	right ring,
	includeTouch bool,
	budget *validationBudget,
) (bool, error) {
	if !ringBounds(left).overlaps(ringBounds(right)) {
		return false, nil
	}
	for leftIndex := 0; leftIndex < len(left)-1; leftIndex++ {
		for rightIndex := 0; rightIndex < len(right)-1; rightIndex++ {
			a, b := left[leftIndex], left[leftIndex+1]
			c, d := right[rightIndex], right[rightIndex+1]
			if err := budget.spend(); err != nil {
				return false, err
			}
			if !segmentBoundsOverlap(a, b, c, d) {
				continue
			}
			if includeTouch {
				if segmentsIntersect(a, b, c, d) {
					return true, nil
				}
			} else if properIntersection(a, b, c, d) {
				return true, nil
			}
		}
	}
	return false, nil
}

func segmentsIntersect(a, b, c, d point) bool {
	o1, o2, o3, o4 := orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)
	return (o1 == 0 && onSegment(a, c, b)) ||
		(o2 == 0 && onSegment(a, d, b)) ||
		(o3 == 0 && onSegment(c, a, d)) ||
		(o4 == 0 && onSegment(c, b, d)) ||
		((o1 > 0) != (o2 > 0) && (o3 > 0) != (o4 > 0))
}

func properIntersection(a, b, c, d point) bool {
	o1, o2, o3, o4 := orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)
	return o1 != 0 && o2 != 0 && o3 != 0 && o4 != 0 &&
		(o1 > 0) != (o2 > 0) && (o3 > 0) != (o4 > 0)
}

func orient(a, b, c point) int {
	left := new(big.Rat).Mul(new(big.Rat).Sub(b.x, a.x), new(big.Rat).Sub(c.y, a.y))
	right := new(big.Rat).Mul(new(big.Rat).Sub(b.y, a.y), new(big.Rat).Sub(c.x, a.x))
	return left.Sub(left, right).Sign()
}

func onSegment(a, candidate, b point) bool {
	if orient(a, b, candidate) != 0 {
		return false
	}
	return between(candidate.x, a.x, b.x) && between(candidate.y, a.y, b.y)
}

func between(value, left, right *big.Rat) bool {
	if left.Cmp(right) > 0 {
		left, right = right, left
	}
	return value.Cmp(left) >= 0 && value.Cmp(right) <= 0
}

func equalPoint(left, right point) bool {
	return left.x.Cmp(right.x) == 0 && left.y.Cmp(right.y) == 0
}

func pointKey(value point) string {
	return value.x.RatString() + "," + value.y.RatString()
}

func absRat(value *big.Rat) *big.Rat {
	if value.Sign() < 0 {
		return value.Neg(value)
	}
	return value
}

func equalRing(left, right ring, budget *validationBudget) (bool, error) {
	leftVertices := left[:len(left)-1]
	rightVertices := right[:len(right)-1]
	if len(leftVertices) != len(rightVertices) {
		return false, nil
	}
	for start, candidate := range rightVertices {
		if !equalPoint(leftVertices[0], candidate) {
			continue
		}
		for _, direction := range []int{1, -1} {
			equal := true
			for offset := range leftVertices {
				if err := budget.spend(); err != nil {
					return false, err
				}
				index := (start + direction*offset + len(rightVertices)) % len(rightVertices)
				if !equalPoint(leftVertices[offset], rightVertices[index]) {
					equal = false
					break
				}
			}
			if equal {
				return true, nil
			}
		}
	}
	return false, nil
}
