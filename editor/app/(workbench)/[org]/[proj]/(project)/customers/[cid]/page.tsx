"use client";

import { CalendarIcon, CheckCircle2, Clock, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Customer } from "@/types";

type CustomerDetails = {
  customer: Customer;
  activities: {}[];
  logs: {}[];
};

// This would typically come from your database
const customer = {
  uid: "550e8400-e29b-41d4-a716-446655440000",
  name: "Jane Smith",
  email: "jane.smith@example.com",
  phone: "+1 (555) 123-4567",
  created_at: new Date("2023-01-15T09:24:00"),
  last_seen_at: new Date("2023-06-10T14:30:00"),
  is_email_verified: true,
  is_phone_verified: false,
  description: "Enterprise customer for Project Alpha",
  project_id: 12345,
};

// Sample data for the tabs
const recentActivity = [
  {
    id: 1,
    type: "Login",
    timestamp: new Date("2023-06-10T14:30:00"),
    details: "Logged in from Chrome on macOS",
  },
  {
    id: 2,
    type: "Purchase",
    timestamp: new Date("2023-06-05T10:15:00"),
    details: "Purchased Premium Plan - $99",
  },
  {
    id: 3,
    type: "Support",
    timestamp: new Date("2023-05-28T09:45:00"),
    details: "Opened support ticket #4532",
  },
];

const logs = [
  {
    id: 1,
    level: "info",
    timestamp: new Date("2023-06-10T14:30:00"),
    message: "User logged in successfully",
  },
  {
    id: 2,
    level: "info",
    timestamp: new Date("2023-06-05T10:15:00"),
    message: "Payment processed successfully",
  },
  {
    id: 3,
    level: "warning",
    timestamp: new Date("2023-05-20T11:30:00"),
    message: "Failed login attempt",
  },
];

const events = [
  {
    id: 1,
    name: "user.login",
    timestamp: new Date("2023-06-10T14:30:00"),
    data: { ip: "192.168.1.1", device: "desktop" },
  },
  {
    id: 2,
    name: "payment.success",
    timestamp: new Date("2023-06-05T10:15:00"),
    data: { amount: 99, currency: "USD" },
  },
  {
    id: 3,
    name: "email.sent",
    timestamp: new Date("2023-05-25T16:20:00"),
    data: { template: "invoice", status: "delivered" },
  },
];

export default function CustomerDetailPage() {
  return (
    <div className="container mx-auto py-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Customer</h1>
        <p className="text-muted-foreground">
          View and manage customer details
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-lg">
                  {customer.name?.charAt(0) || "?"}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-xl">
                  {customer.name || "Unnamed Customer"}
                </CardTitle>
                <CardDescription>{customer.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <h3 className="text-sm font-medium leading-none">Email</h3>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    {customer.email}
                  </p>
                  {customer.is_email_verified ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium leading-none">Phone</h3>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    {customer.phone}
                  </p>
                  {customer.is_phone_verified ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium leading-none">
                  Customer ID
                </h3>
                <p className="text-sm text-muted-foreground">{customer.uid}</p>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium leading-none">Created</h3>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {customer.created_at.toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium leading-none">Last seen</h3>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {formatDistanceToNow(customer.last_seen_at, {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium leading-none">Project ID</h3>
                <p className="text-sm text-muted-foreground">
                  {customer.project_id}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="activity">
          <TabsList>
            <TabsTrigger value="activity">Recent activity</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>
                  Recent interactions with this customer
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivity.map((activity) => (
                    <div key={activity.id} className="flex flex-col space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{activity.type}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatDistanceToNow(activity.timestamp, {
                            addSuffix: true,
                          })}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {activity.details}
                      </p>
                      <Separator className="mt-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle>Logs</CardTitle>
                <CardDescription>
                  System logs related to this customer
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {logs.map((log) => (
                    <div key={log.id} className="flex flex-col space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              log.level === "warning" ? "outline" : "secondary"
                            }
                          >
                            {log.level}
                          </Badge>
                          <div className="font-medium">{log.message}</div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatDistanceToNow(log.timestamp, {
                            addSuffix: true,
                          })}
                        </div>
                      </div>
                      <Separator className="mt-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle>Events</CardTitle>
                <CardDescription>
                  Events triggered by or for this customer
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {events.map((event) => (
                    <div key={event.id} className="flex flex-col space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{event.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatDistanceToNow(event.timestamp, {
                            addSuffix: true,
                          })}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <pre className="mt-2 rounded bg-muted p-2 font-mono text-xs">
                          {JSON.stringify(event.data, null, 2)}
                        </pre>
                      </div>
                      <Separator className="mt-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
