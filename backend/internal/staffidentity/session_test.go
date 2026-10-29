package staffidentity

import (
	"encoding/json"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestSessionDirectoryIsJurisdictionAndRoleScoped(t *testing.T) {
	directory := []Organization{
		{ID: "state", Role: "state", Counties: []string{"003", "009"}},
		{ID: "oahu", Role: "county", Counties: []string{"003"}},
		{ID: "maui", Role: "county", Counties: []string{"009"}},
		{ID: "transport", Role: "transport", Counties: []string{"003"}},
		{ID: "backup", Role: "transport", Counties: []string{"003"}},
	}
	for _, tc := range []struct {
		name     string
		member   Member
		ids      []string
		counties []string
	}{
		{"county", Member{Organization: "oahu", Role: "county", Counties: []string{"003"}}, []string{"state", "oahu", "transport", "backup"}, []string{"003"}},
		{"state", Member{Organization: "state", Role: "state", Counties: []string{"003", "009"}}, []string{"state", "oahu", "maui", "transport", "backup"}, []string{"003", "009"}},
		{"partner", Member{Organization: "transport", Role: "transport", Counties: []string{"003"}}, []string{"transport"}, []string{"003"}},
		{"other-county", Member{Organization: "maui", Role: "county", Counties: []string{"009"}}, []string{"state", "maui"}, []string{"009"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			writeSession(w, tc.member, directory)
			var body struct {
				Organizations []Organization `json:"organizations"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			ids := []string{}
			for _, org := range body.Organizations {
				ids = append(ids, org.ID)
			}
			if !reflect.DeepEqual(ids, tc.ids) {
				t.Fatalf("directory IDs %v, want %v", ids, tc.ids)
			}
			if !reflect.DeepEqual(body.Organizations[0].Counties, tc.counties) {
				t.Fatal("out-of-scope county metadata leaked")
			}
		})
	}
	if !reflect.DeepEqual(directory[0].Counties, []string{"003", "009"}) {
		t.Fatal("session scoping mutated configured directory")
	}
}
