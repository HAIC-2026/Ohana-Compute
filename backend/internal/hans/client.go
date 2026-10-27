package hans

import (
	"context"
	"time"
)

type Snapshot struct {
	Source       string    `json:"source"`
	Status       string    `json:"status"`
	Authority    string    `json:"authority"`
	RetrievedAt  time.Time `json:"retrieved_at"`
	Limitation   string    `json:"limitation"`
	OfficialURL  string    `json:"official_url"`
	Provisional  bool      `json:"provisional"`
	ProductionOn bool      `json:"production_enabled"`
}

type Client struct {
	now func() time.Time
}

func NewClient(now func() time.Time) *Client {
	if now == nil {
		now = time.Now
	}
	return &Client{now: now}
}

func (client *Client) Snapshot(context.Context) (Snapshot, error) {
	return Snapshot{
		Source:      "usgs_hans",
		Status:      "unavailable",
		Authority:   "U.S. Geological Survey Hawaiian Volcano Observatory",
		RetrievedAt: client.now().UTC(),
		Limitation:  "Production ingestion is disabled because no stable, supported public machine-readable HANS contract is configured. Web pages are not scraped.",
		OfficialURL: "https://volcanoes.usgs.gov/hans-public/",
		Provisional: true,
	}, nil
}
