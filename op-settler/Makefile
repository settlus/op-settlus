#!/usr/bin/make -f

BUILDDIR ?= $(CURDIR)/build

.PHONY: all proto build test

all: proto build

proto:
	@protoc --proto_path=proto proto/*.proto --go_out=. --go-grpc_out=.

build:
	@go build -mod=readonly -o $(BUILDDIR)/op-settler -ldflags "-w -s" ./main.go

test:
	@go test -v ./...
