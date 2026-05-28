// Source: extension.beautified.js  (verbatim, beautified from out/extension.js)
// Start line: 63570
// Description: Spawn 'codex app-server --analytics-default-enabled' and wire stdio

        this.proc &&
          this.isProcessAlive(this.proc) &&
          (this.logger.info("Tearing down existing codex MCP process"),
          this.teardownProcess()));
      let e;
      try {
        if (
          (this.logger.info("Spawning codex app-server"),
          (e = gce(this.extensionUri, "app-server", [
            "--analytics-default-enabled",
          ])),
          e.pid == null)
        )
          return (
            this.broadcastFatalError(
              this.createProcessError("Failed to start Codex process"),
            ),
            { success: !1, errorMessage: "Failed to spawn Codex process" }
          );
      } catch (r) {
        if (r instanceof sp)
          return (
            this.broadcastFatalError(r),
            { success: !1, errorMessage: r.message }
          );
        let n = r instanceof Error ? r.message : String(r);
        return (
          this.broadcastFatalError(
            this.createProcessError(`Failed to start Codex process: ${n}`),
          ),
          { success: !1, errorMessage: n }
