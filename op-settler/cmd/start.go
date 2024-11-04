package cmd

import (
	"github.com/settlus/op-settler/service"

	"github.com/spf13/cobra"
)

func init() {
	startCmd := &cobra.Command{
		Use:   "start",
		Short: "Start settler service",
		RunE:  start,
	}

	rootCmd.AddCommand(startCmd)
}

func start(_ *cobra.Command, _ []string) error {
	return service.StartSettler(rootCmd.Context())
}
