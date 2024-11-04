/*
Copyright © 2024 NAME HERE <EMAIL ADDRESS>
*/
package cmd

import (
	"context"
	log "github.com/sirupsen/logrus"
	"os"
	"os/signal"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "op-settler",
	Short: "settler for op-settlus",
	Long:  `op-settler is calling settleAll() function in TenantFactory contract after new block is produced`,
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		logFormat, err := cmd.Flags().GetString("log-format")
		if err != nil {
			logFormat = "text"
		}

		switch logFormat {
		case "json":
			log.SetFormatter(&log.JSONFormatter{})
		case "text":
			log.SetFormatter(&log.TextFormatter{})
		default:
			panic("invalid log format, must be one of (text|json)")
		}

		logLevel, err := cmd.Flags().GetString("log-level")
		if err != nil {
			logLevel = "info"
		}

		level, err := log.ParseLevel(logLevel)
		if err != nil {
			panic("invalid log level, must be one of (debug|info|warn|error|fatal|panic)")
		}

		log.SetLevel(level)
		log.Infoln("Starting settler...")

		return nil
	},
}

func Execute() error {
	flags := rootCmd.PersistentFlags()
	flags.String("log-format", "text", "Log format (text|json)")
	flags.String("log-level", "info", "Log level (debug|info|warn|error|fatal|panic)")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle interrupt signal directly in Execute
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt)
	go func() {
		<-c
		log.Infoln("Interrupt signal received, terminating service")
		cancel()
	}()

	rootCmd.SetContext(ctx)
	
	if err := rootCmd.Execute(); err != nil {
        log.Errorf("Execution error: %v", err)
        return err
    }
	return nil
}
