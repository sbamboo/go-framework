#!/usr/bin/env python3
import socket
import json
import argparse

def send_udp(ip, port, message):
    """Send a JSON message via UDP"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    try:
        sock.sendto(message.encode('utf-8'), (ip, port))
        print(f"Sent: {message}")
    finally:
        sock.close()

def main():
    parser = argparse.ArgumentParser(description="UDP JSON broadcaster")
    parser.add_argument("-ip", required=True, help="Target IP address")
    parser.add_argument("-port", required=True, type=int, help="Target port")
    parser.add_argument("-body", required=False, help="JSON string to send once")
    args = parser.parse_args()

    ip = args.ip
    port = args.port

    if args.body:
        # Send one-time message
        try:
            json.loads(args.body)  # validate JSON
        except json.JSONDecodeError as e:
            print(f"Invalid JSON: {e}")
            return
        send_udp(ip, port, args.body)
    else:
        # Interactive loop
        print(f"UDP broadcaster started. Type JSON to send. Type 'exit' to quit.")
        try:
            while True:
                user_input = input("> ").strip()
                if user_input.lower() == "exit":
                    print("Exiting...")
                    break
                try:
                    # Validate JSON
                    json_obj = json.loads(user_input)
                    send_udp(ip, port, json.dumps(json_obj))
                except json.JSONDecodeError as e:
                    print(f"Invalid JSON: {e}")
        except KeyboardInterrupt:
            print("\nKeyboard interrupt received. Exiting...")

if __name__ == "__main__":
    main()
