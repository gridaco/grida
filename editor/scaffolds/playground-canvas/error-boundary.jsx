import React from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);

    // Define a state variable to track whether is an error or not
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI

    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    // You can use your own error logging service here
    console.log({ error, errorInfo });
  }
  render() {
    // Check if the error is thrown
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background">
          <h1 className="text-4xl font-bold mb-4">
            Oops! Something went wrong
          </h1>
          <p className="text-xl mb-8 text-muted-foreground">
            We&apos;re sorry, but an error occurred while processing your
            request.
          </p>
          <div className="flex space-x-4">
            <Button
              onClick={() => {
                // Reset the error state
                this.setState({ hasError: false });
              }}
            >
              Try again
            </Button>
            <Link href="https://github.com/gridaco/grida/issues">
              <Button variant="secondary">Report a problem</Button>
            </Link>
          </div>
        </div>
      );
    }

    // Return children components in case of no error

    return this.props.children;
  }
}

export default ErrorBoundary;
