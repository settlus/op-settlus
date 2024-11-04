package cmd

import (
	"github.com/settlus/op-settler/service"
	log "github.com/sirupsen/logrus"

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
	err := service.Start(rootCmd.Context())
	if err != nil {
		log.Errorf("Settler service terminated with error: %v", err)
	} else {
		log.Infoln("Settler service terminated gracefully")
	}
	return err
}
