package ptwc

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestLatestProductNormalizesCAP(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = writer.Write([]byte(`<?xml version="1.0"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
<identifier>PHEB-1-123</identifier><sent>2026-10-26T19:00:00-00:00</sent>
<status>Actual</status><msgType>Alert</msgType><incidents>123</incidents>
<info><event>Tsunami Warning</event><responseType>Evacuate</responseType>
<urgency>Immediate</urgency><severity>Extreme</severity><certainty>Observed</certainty>
<onset>2026-10-26T19:00:00-00:00</onset><expires>2026-10-26T21:00:00-00:00</expires>
<senderName>PTWC</senderName><headline>Warning</headline><description>Details</description>
<instruction>Move inland.</instruction><web>https://example.test/bulletin</web>
<parameter><valueName>EventLocationName</valueName><value>Pacific Ocean</value></parameter>
<parameter><valueName>EventPreliminaryMagnitude</valueName><value>7.5</value></parameter>
<area><areaDesc>Hawaiian Islands</areaDesc><circle>20.0,-157.0 0.0</circle></area>
</info></alert>`))
	}))
	defer server.Close()

	now := time.Date(2026, 10, 26, 19, 30, 0, 0, time.UTC)
	client := NewClient(Config{
		HTTPClient: server.Client(),
		CAPURL:     server.URL,
		Now:        func() time.Time { return now },
	})
	snapshot, err := client.LatestProduct(context.Background())
	if err != nil {
		t.Fatalf("LatestProduct returned error: %v", err)
	}
	product := snapshot.Product
	if product.ActionLevel != "warning" || !product.IsCurrent {
		t.Fatalf("unexpected product: %#v", product)
	}
	if product.Latitude == nil || *product.Latitude != 20 ||
		product.Longitude == nil || *product.Longitude != -157 {
		t.Fatalf("unexpected coordinates: %#v", product)
	}
	if product.EventLocation != "Pacific Ocean" || product.Magnitude != "7.5" {
		t.Fatalf("unexpected parameters: %#v", product.Parameters)
	}
}

func TestLatestProductMarksExpiredStatement(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = writer.Write([]byte(`<alert><identifier>one</identifier><sent>2026-10-25T01:00:00Z</sent>
<status>Actual</status><msgType>Alert</msgType><info><event>Tsunami Information</event>
<expires>2026-10-25T02:00:00Z</expires></info></alert>`))
	}))
	defer server.Close()

	client := NewClient(Config{
		HTTPClient: server.Client(),
		CAPURL:     server.URL,
		Now: func() time.Time {
			return time.Date(2026, 10, 26, 19, 30, 0, 0, time.UTC)
		},
	})
	snapshot, err := client.LatestProduct(context.Background())
	if err != nil {
		t.Fatalf("LatestProduct returned error: %v", err)
	}
	if snapshot.Product.IsCurrent {
		t.Fatal("expected expired product")
	}
	if len(snapshot.Warnings) < 2 {
		t.Fatalf("expected expired warning: %#v", snapshot.Warnings)
	}
}
