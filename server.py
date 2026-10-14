#!/usr/bin/env python3
"""
Lightweight local HTTP server for Calgary Clinic Intelligence Map.
Serves index.html with no external dependencies required.
"""
import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def main():
    os.chdir(DIRECTORY)
    # Enable socket address reuse to prevent 'Address already in use' errors
    socketserver.TCPServer.allow_reuse_address = True
    
    # Try PORT, or fallback to next available ports
    for p in range(PORT, PORT + 20):
        try:
            with socketserver.TCPServer(("", p), Handler) as httpd:
                url = f"http://localhost:{p}"
                print("=" * 60)
                print(f"🚀 Calgary Clinic Intelligence Map is LIVE!")
                print(f"📍 URL: {url}")
                print(f"📂 Serving directory: {DIRECTORY}")
                print(f"💡 Press Ctrl+C to stop the server")
                print("=" * 60)
                
                # Auto-open browser
                try:
                    webbrowser.open(url)
                except Exception:
                    pass

                httpd.serve_forever()
                break
        except OSError as e:
            if "Address already in use" in str(e):
                continue
            else:
                print(f"Error starting server on port {p}: {e}")
                sys.exit(1)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n👋 Server stopped.")
