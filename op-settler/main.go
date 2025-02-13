/*
Copyright © 2024 NAME HERE <EMAIL ADDRESS>
*/
package main

import "github.com/settlus/op-settler/cmd"

func main() {
	if err := cmd.Execute(); err != nil {
		panic(err)
	}
}
