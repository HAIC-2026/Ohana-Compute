package nws

import (
	"bytes"
	"encoding/json"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"
)

const (
	MaxIdentityBytes = 512
	MaxTimeBytes     = 64
	MaxEnumBytes     = 32
	MaxTextBytes     = 256
	MaxAreaBytes     = 2048
	MaxListItems     = 64
	MaxGeometryBytes = 16 << 10
	MaxVertices      = 512
	MaxAlerts        = 100
)

// Product contains bounded source facts, not planning-location applicability or
// inferred times. Invalid or oversized fields are null rather than truncated.
type Product struct {
	ID            *string     `json:"id"`
	URL           *string     `json:"url"`
	Sender        *string     `json:"sender"`
	SenderName    *string     `json:"sender_name"`
	Sent          *string     `json:"sent"`
	Effective     *string     `json:"effective"`
	Onset         *string     `json:"onset"`
	Expires       *string     `json:"expires"`
	Ends          *string     `json:"ends"`
	Status        *string     `json:"status"`
	MessageType   *string     `json:"message_type"`
	Scope         *string     `json:"scope"`
	Event         *string     `json:"event"`
	Headline      *string     `json:"headline"`
	Severity      *string     `json:"severity"`
	Certainty     *string     `json:"certainty"`
	Urgency       *string     `json:"urgency"`
	Response      *string     `json:"response"`
	AreaDesc      *string     `json:"area_desc"`
	References    []Reference `json:"references"`
	AffectedZones []Zone      `json:"affected_zones"`
	Geocode       Geocode     `json:"geocode"`
	Geometry      Geometry    `json:"geometry"`
}

type Reference struct {
	URL        *string `json:"url"`
	Identifier *string `json:"identifier"`
	Sender     *string `json:"sender"`
	Sent       *string `json:"sent"`
}

type Zone struct {
	URL  string `json:"url"`
	ID   string `json:"id"`
	Type string `json:"type"`
}

type Geocode struct {
	UGC  []string `json:"ugc"`
	SAME []string `json:"same"`
}

type Geometry struct {
	Status string          `json:"status"`
	Type   *string         `json:"type"`
	Shape  json.RawMessage `json:"shape"`
}

type referenceProperties struct {
	URL        *string `json:"@id"`
	Identifier *string `json:"identifier"`
	Sender     *string `json:"sender"`
	Sent       *string `json:"sent"`
}

var (
	zoneIDPattern = regexp.MustCompile(`^[A-Z]{2}[CZ][0-9]{3}$`)
	samePattern   = regexp.MustCompile(`^[0-9]{6}$`)
)

func boundedString(value *string, maximum int) *string {
	if value == nil || len(*value) > maximum || strings.TrimSpace(*value) == "" || !utf8.ValidString(*value) {
		return nil
	}
	copy := *value
	return &copy
}

func sourceString(value string) *string {
	return &value
}

func publicAPIURL(value *string, prefix string) *string {
	value = boundedString(value, MaxIdentityBytes)
	if value == nil {
		return nil
	}
	parsed, err := url.Parse(*value)
	if err != nil || parsed.Scheme != "https" || parsed.Host != "api.weather.gov" ||
		parsed.User != nil || parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" ||
		!strings.HasPrefix(parsed.Path, prefix) {
		return nil
	}
	suffix := strings.TrimPrefix(parsed.Path, prefix)
	if suffix == "" || strings.ContainsAny(suffix, "/\\ \t\r\n") || suffix == "." || suffix == ".." {
		return nil
	}
	return value
}

func productFromFeature(item feature) Product {
	props := item.Properties
	productURL := sourceString(item.ID)
	if item.ID == "" {
		productURL = props.URL
	}
	product := Product{
		ID: boundedString(props.ID, MaxIdentityBytes), URL: publicAPIURL(productURL, "/alerts/"),
		Sender: boundedString(props.Sender, MaxTextBytes), SenderName: boundedString(props.SenderName, MaxTextBytes),
		Sent: boundedString(props.Sent, MaxTimeBytes), Effective: boundedString(props.Effective, MaxTimeBytes),
		Onset: boundedString(props.Onset, MaxTimeBytes), Expires: boundedString(props.Expires, MaxTimeBytes),
		Ends: boundedString(props.Ends, MaxTimeBytes), Status: boundedString(props.Status, MaxEnumBytes),
		MessageType: boundedString(props.MessageType, MaxEnumBytes), Scope: boundedString(props.Scope, MaxEnumBytes),
		Event: boundedString(props.Event, MaxTextBytes), Headline: boundedString(props.Headline, MaxTextBytes),
		Severity: boundedString(props.Severity, MaxEnumBytes), Certainty: boundedString(props.Certainty, MaxEnumBytes),
		Urgency: boundedString(props.Urgency, MaxEnumBytes), Response: boundedString(props.ResponseType, MaxEnumBytes),
		AreaDesc: boundedString(props.Area, MaxAreaBytes), Geometry: boundedGeometry(item.Geometry),
		Geocode: Geocode{
			UGC: boundedCodes(props.Geocode.UGC, zoneIDPattern), SAME: boundedCodes(props.Geocode.SAME, samePattern),
		},
	}
	if props.References != nil && len(props.References) <= MaxListItems {
		product.References = make([]Reference, 0, len(props.References))
		for _, reference := range props.References {
			product.References = append(product.References, Reference{
				URL: publicAPIURL(reference.URL, "/alerts/"), Identifier: boundedString(reference.Identifier, MaxIdentityBytes),
				Sender: boundedString(reference.Sender, MaxTextBytes), Sent: boundedString(reference.Sent, MaxTimeBytes),
			})
		}
	}
	if props.AffectedZones != nil && len(props.AffectedZones) <= MaxListItems {
		product.AffectedZones = make([]Zone, 0, len(props.AffectedZones))
		for _, link := range props.AffectedZones {
			zone, ok := parseZone(link)
			if !ok {
				product.AffectedZones = nil
				break
			}
			product.AffectedZones = append(product.AffectedZones, zone)
		}
	}
	return product
}

func boundedCodes(values []string, pattern *regexp.Regexp) []string {
	if values == nil || len(values) > MaxListItems {
		return nil
	}
	result := make([]string, len(values))
	for index, value := range values {
		if !pattern.MatchString(value) {
			return nil
		}
		result[index] = value
	}
	return result
}

func parseZone(link string) (Zone, bool) {
	for _, kind := range []string{"forecast", "county", "fire"} {
		prefix := "/zones/" + kind + "/"
		if publicAPIURL(&link, prefix) == nil {
			continue
		}
		parsed, _ := url.Parse(link)
		id := strings.TrimPrefix(parsed.Path, prefix)
		if zoneIDPattern.MatchString(id) &&
			((kind == "county" && id[2] == 'C') || (kind != "county" && id[2] == 'Z')) {
			return Zone{URL: link, ID: id, Type: kind}, true
		}
	}
	return Zone{}, false
}

func boundedGeometry(raw json.RawMessage) Geometry {
	result := Geometry{Status: "absent"}
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return result
	}
	if len(raw) > MaxGeometryBytes {
		result.Status = "too_large"
		return result
	}
	result.Status = "invalid"
	var shape struct {
		Type        string          `json:"type"`
		Coordinates json.RawMessage `json:"coordinates"`
	}
	if json.Unmarshal(raw, &shape) != nil || shape.Type == "" {
		return result
	}
	result.Type = boundedString(&shape.Type, MaxEnumBytes)
	var polygons [][][][]*float64
	switch shape.Type {
	case "Polygon":
		var polygon [][][]*float64
		if json.Unmarshal(shape.Coordinates, &polygon) != nil {
			return result
		}
		polygons = [][][][]*float64{polygon}
	case "MultiPolygon":
		if json.Unmarshal(shape.Coordinates, &polygons) != nil {
			return result
		}
	default:
		result.Status = "unsupported"
		return result
	}
	if len(polygons) == 0 {
		return result
	}
	vertices := 0
	for _, polygon := range polygons {
		if len(polygon) == 0 {
			return result
		}
		for _, ring := range polygon {
			if len(ring) < 4 {
				return result
			}
			for _, point := range ring {
				vertices++
				if vertices > MaxVertices {
					result.Status = "too_large"
					return result
				}
				if len(point) != 2 || point[0] == nil || point[1] == nil ||
					*point[0] < -180 || *point[0] > 180 || *point[1] < -90 || *point[1] > 90 {
					return result
				}
			}
			if *ring[0][0] != *ring[len(ring)-1][0] || *ring[0][1] != *ring[len(ring)-1][1] {
				return result
			}
		}
	}
	// Re-encode only validated geometry fields; arbitrary GeoJSON extensions
	// must not smuggle unbounded/unvalidated content into the projection.
	result.Shape, _ = json.Marshal(shape)
	result.Status = "valid"
	return result
}

func cloneProduct(product Product) Product {
	cloneStrings(
		&product.ID, &product.URL, &product.Sender, &product.SenderName,
		&product.Sent, &product.Effective, &product.Onset, &product.Expires, &product.Ends,
		&product.Status, &product.MessageType, &product.Scope, &product.Event, &product.Headline,
		&product.Severity, &product.Certainty, &product.Urgency, &product.Response, &product.AreaDesc,
		&product.Geometry.Type,
	)
	product.References = cloneSlice(product.References)
	for index := range product.References {
		reference := &product.References[index]
		cloneStrings(&reference.URL, &reference.Identifier, &reference.Sender, &reference.Sent)
	}
	product.AffectedZones = cloneSlice(product.AffectedZones)
	product.Geocode.UGC = cloneSlice(product.Geocode.UGC)
	product.Geocode.SAME = cloneSlice(product.Geocode.SAME)
	product.Geometry.Shape = cloneSlice(product.Geometry.Shape)
	return product
}

func cloneStrings(values ...**string) {
	for _, field := range values {
		if *field != nil {
			copy := **field
			*field = &copy
		}
	}
}

func cloneSlice[T any](values []T) []T {
	if values == nil {
		return nil
	}
	return append([]T{}, values...)
}
