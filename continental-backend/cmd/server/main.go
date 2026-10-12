package main

import (
	"flag"
	"log"
	"os"

	"continental/server"
)

func main() {
	var (
		port = flag.String("port", "8080", "Server port")
	)
	flag.Parse()

	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.SetOutput(os.Stdout)

	log.Println("[Server] Starting Continental game server...")
	
	srv := server.NewServer(*port)
	
	if err := srv.Start(); err != nil {
		log.Fatalf("[Server] Failed to start server: %v", err)
	}
}
