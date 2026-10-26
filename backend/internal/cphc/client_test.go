package cphc

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestActiveCyclonesNormalizesSummaryAndProducts(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/rss+xml")
		_, _ = writer.Write([]byte(`<?xml version="1.0"?>
<rss xmlns:nhc="https://www.nhc.noaa.gov"><channel>
<pubDate>Mon, 26 Oct 2026 19:18:30 GMT</pubDate>
<item><title>Summary - Tropical Depression Olana (CP3/CP032026)</title>
<pubDate>Mon, 26 Oct 2026 14:34:37 GMT</pubDate>
<link>https://example.test/advisory</link>
<nhc:Cyclone><nhc:center>13.9, -176.8</nhc:center><nhc:type>Tropical Depression</nhc:type>
<nhc:name>Olana</nhc:name><nhc:wallet>CP3</nhc:wallet><nhc:atcf>CP032026</nhc:atcf>
<nhc:datetime>5:00 AM HST Mon Oct 26</nhc:datetime><nhc:movement>SE at 5 mph</nhc:movement>
<nhc:pressure>1005 mb</nhc:pressure><nhc:wind>35 mph</nhc:wind>
<nhc:headline>OLANA WEAKENS</nhc:headline></nhc:Cyclone></item>
<item><title>Advisory #005 Cone of Uncertainty [kmz] - Tropical Depression Olana (CP3/CP032026)</title>
<pubDate>Mon, 26 Oct 2026 14:36:52 GMT</pubDate><link>https://example.test/cone.kmz</link></item>
</channel></rss>`))
	}))
	defer server.Close()

	now := time.Date(2026, 10, 26, 19, 30, 0, 0, time.UTC)
	client := NewClient(Config{
		HTTPClient: server.Client(),
		FeedURL:    server.URL,
		Now:        func() time.Time { return now },
	})
	snapshot, err := client.ActiveCyclones(context.Background())
	if err != nil {
		t.Fatalf("ActiveCyclones returned error: %v", err)
	}
	if len(snapshot.Cyclones) != 1 {
		t.Fatalf("cyclones = %d, want 1", len(snapshot.Cyclones))
	}
	cyclone := snapshot.Cyclones[0]
	if cyclone.ATCF != "CP032026" || cyclone.Latitude != 13.9 || cyclone.Longitude != -176.8 {
		t.Fatalf("unexpected cyclone: %#v", cyclone)
	}
	if len(cyclone.Products) != 1 || cyclone.Products[0].Kind != "cone" {
		t.Fatalf("unexpected products: %#v", cyclone.Products)
	}
}

func TestActiveCyclonesServesStaleSnapshot(t *testing.T) {
	t.Parallel()

	fail := false
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		if fail {
			http.Error(writer, "unavailable", http.StatusServiceUnavailable)
			return
		}
		_, _ = writer.Write([]byte(`<rss><channel><pubDate>now</pubDate></channel></rss>`))
	}))
	defer server.Close()

	now := time.Date(2026, 10, 26, 19, 30, 0, 0, time.UTC)
	client := NewClient(Config{
		HTTPClient: server.Client(),
		FeedURL:    server.URL,
		CacheTTL:   time.Minute,
		Now:        func() time.Time { return now },
	})
	if _, err := client.ActiveCyclones(context.Background()); err != nil {
		t.Fatalf("initial load: %v", err)
	}
	fail = true
	now = now.Add(2 * time.Minute)
	snapshot, err := client.ActiveCyclones(context.Background())
	if err != nil {
		t.Fatalf("stale load: %v", err)
	}
	if snapshot.Source.Status != "stale" || snapshot.Source.RefreshAttemptedAt == nil {
		t.Fatalf("unexpected stale source: %#v", snapshot.Source)
	}
}
