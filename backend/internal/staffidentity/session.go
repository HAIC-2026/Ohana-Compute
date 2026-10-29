package staffidentity

import (
	"encoding/json"
	"net/http"
	"slices"
)

func writeSession(w http.ResponseWriter, member Member, organizations []Organization) {
	scoped := make([]Organization, 0)
	for _, organization := range organizations {
		counties := make([]string, 0)
		for _, county := range organization.Counties {
			if slices.Contains(member.Counties, county) {
				counties = append(counties, county)
			}
		}
		if len(counties) == 0 ||
			(member.Role != "county" && member.Role != "state" && organization.ID != member.Organization) {
			continue
		}
		organization.Counties = counties
		scoped = append(scoped, organization)
	}
	_ = json.NewEncoder(w).Encode(struct {
		Enabled       bool           `json:"enabled"`
		Authenticated bool           `json:"authenticated"`
		Member        Member         `json:"member"`
		Organizations []Organization `json:"organizations"`
	}{true, true, member, scoped})
}
