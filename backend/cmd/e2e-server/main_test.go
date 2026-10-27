package main

import (
	"net"
	"strconv"
	"strings"
	"testing"
)

func TestRunReturnsListenError(t *testing.T) {
	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	port := strconv.Itoa(listener.Addr().(*net.TCPAddr).Port)
	t.Setenv("PORT", port)

	err = run()
	if err == nil {
		t.Fatal("run() error = nil, want listen error")
	}
	if !strings.Contains(err.Error(), "address already in use") {
		t.Fatalf("run() error = %v, want address already in use", err)
	}
}
