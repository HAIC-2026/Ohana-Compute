package official

import (
	"encoding/json"
	"math"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
)

func reportedShelter(feature arcgis.Feature, latitude, longitude float64) (Shelter, bool) {
	coordinates, ok := pointCoordinates(feature.Geometry)
	if !ok || feature.Type != "Feature" || math.Abs(coordinates[0]) > 180 ||
		math.Abs(coordinates[1]) > 90 {
		return Shelter{}, false
	}
	id, ok := shelterID(feature.Properties)
	if !ok {
		return Shelter{}, false
	}
	shelter := Shelter{ID: id, Coordinates: coordinates}
	for _, field := range []struct {
		key      string
		target   *string
		limit    int
		required bool
	}{
		{"shelter_name", &shelter.Name, 256, true},
		{"city", &shelter.City, 128, false},
		{"shelter_status", &shelter.Status, 64, false},
		{"wheelchair_accessible", &shelter.WheelchairAccessible, 64, false},
		{"pet_accommodations_code", &shelter.PetAccommodationsCode, 64, false},
	} {
		value, valid := reportedShelterText(feature.Properties[field.key], field.limit)
		if !valid || (field.required && value == "") {
			return Shelter{}, false
		}
		*field.target = value
	}
	shelter.Capacity, ok = reportedShelterCapacity(feature.Properties["evacuation_capacity"])
	if !ok {
		return Shelter{}, false
	}
	// These existing operational fields never enter lifecycle source claims.
	shelter.Address, _ = feature.Properties["address"].(string)
	shelter.Organization, _ = feature.Properties["org_name"].(string)
	shelter.DistanceMiles = round(haversineMiles(latitude, longitude, coordinates[1], coordinates[0]), 2)
	return shelter, true
}

func reportedShelterText(raw any, limit int) (string, bool) {
	if raw == nil {
		return "", true
	}
	value, ok := raw.(string)
	if !ok || !validShelterText(value, limit) {
		return "", false
	}
	value = strings.TrimSpace(value)
	if strings.EqualFold(value, "unknown") {
		return "", true
	}
	return value, true
}

func shelterID(properties map[string]any) (string, bool) {
	for _, key := range []string{"shelter_id", "objectid"} {
		raw := properties[key]
		if raw == nil || raw == "" {
			continue
		}
		switch value := raw.(type) {
		case string:
			if strings.TrimSpace(value) != "" && validShelterText(value, 128) {
				return value, true
			}
		case int:
			return strconv.Itoa(value), true
		case json.Number:
			if number, err := value.Int64(); err == nil {
				return strconv.FormatInt(number, 10), true
			}
		case float64:
			if !math.IsNaN(value) && !math.IsInf(value, 0) &&
				math.Trunc(value) == value && math.Abs(value) <= 9_007_199_254_740_991 {
				return strconv.FormatFloat(value, 'f', 0, 64), true
			}
		}
		return "", false
	}
	return "", false
}

func validShelterText(value string, limit int) bool {
	if !utf8.ValidString(value) || len(value) > limit {
		return false
	}
	for _, character := range value {
		if character < 0x20 || character == 0x7f {
			return false
		}
	}
	return true
}

func reportedShelterCapacity(raw any) (*int, bool) {
	if raw == nil {
		return nil, true
	}
	var value float64
	switch typed := raw.(type) {
	case int:
		value = float64(typed)
	case float64:
		value = typed
	case json.Number:
		parsed, err := typed.Float64()
		if err != nil {
			return nil, false
		}
		value = parsed
	case string:
		typed = strings.TrimSpace(typed)
		if typed == "" || strings.EqualFold(typed, "unknown") {
			return nil, true
		}
		parsed, err := strconv.Atoi(typed)
		if err != nil {
			return nil, false
		}
		value = float64(parsed)
	default:
		return nil, false
	}
	if math.IsNaN(value) || math.IsInf(value, 0) || value != math.Trunc(value) ||
		value < 0 || value > 1_000_000 {
		return nil, false
	}
	capacity := int(value)
	return &capacity, true
}
