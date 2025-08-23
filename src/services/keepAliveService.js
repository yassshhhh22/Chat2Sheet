import axios from "axios";

class KeepAliveService {
  constructor(url, interval = 14 * 60 * 1000) {
    // 14 minutes (before 15min timeout)
    this.url = url;
    this.interval = interval;
    this.intervalId = null;
  }

  start() {
    if (process.env.NODE_ENV !== "production") {
      console.log("KeepAlive service skipped (not in production)");
      return;
    }

    console.log("🔄 KeepAlive service started - pinging every 14 minutes");
    this.intervalId = setInterval(async () => {
      try {
        const response = await axios.get(`${this.url}/health`, {
          timeout: 30000,
        });
        console.log(
          `✅ KeepAlive ping successful: ${
            response.status
          } at ${new Date().toLocaleTimeString()}`
        );
      } catch (error) {
        console.error("❌ KeepAlive ping failed:", error.message);
      }
    }, this.interval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("⏹️ KeepAlive service stopped");
    }
  }
}

export default KeepAliveService;
