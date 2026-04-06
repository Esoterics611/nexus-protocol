import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { status: "ok", service: "nexus-oracle-reporter", timestamp: new Date().toISOString() };
  }
}
