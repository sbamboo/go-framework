# Debugger Protocol
Is used between the app and any debuggers.
`>>` means incomming to the app.
`<<` means outgoing from the app.
`int:epoch` is in milliseconds.

## Protocol version 1

### << Console Log
```json
{
    "signal": "console:log",
    "protocol": 1,
    "sent": int:epoch,
    "type": "string:logtype" / int:loglevel, // The log type: `DEBUG` / 0    `INFO` / 1    `WARN` / 2    `ERROR` / 3    `UNKNOWN`
    "text": "string", // The log message
    "object": {...} / NULL // Optionall JSON object for context
}
```

### >> Console In
```json
{
    "signal": "console:in",
    "protocol": 1,
    "sent": int:epoch,
    "cmd": "string",
    "object": {...} / NULL // Optionall JSON object for context
}
```

### << Elements Tree
```json
{
    "signal": "elements:tree",
    "protocol": 1,
    "sent": int:epoch,
    "tree": {...}
}
```

### << Elements Update
```json
{
    "signal": "elements:update",
    "protocol": 1,
    "sent": int:epoch,
    "element": "string" / [int,...],
    "properties": {...}
}
```

### >> Elements Mod
```json
{
    "signal": "elements:mod",
    "protocol": 1,
    "sent": int:epoch,
    "element": "string" / [int,...],
    "property": any,
    "value": any
}
```

### << Net Create
```json
{
    "signal": "net:start",
    "protocol": 1,
    "sent": int:epoch,
    "properties": {...}
}
```

### << Net Update
```json
{
    "signal": "net:update",
    "protocol": 1,
    "sent": int:epoch,
    "id": int:netevent.id,
    "properties": {...}
}
```

### << Net Stop
```json
{
    "signal": "net:stop",
    "protocol": 1,
    "sent": int:epoch,
    "id": int:netevent.id
}
```

### << Net Stop + Update
```json
{
    "signal": "net:stop.update",
    "protocol": 1,
    "sent": int:epoch,
    "id": int:netevent.id,
    "properties": {...}
}
```

### << Usage Stats
```json
{
    "signal": "usage:stats",
    "protocol": 1,
    "sent": int:epoch,
    "stats": {...}
}
```

### << Ping
```json
{
    "signal": "misc:ping",
    "protocol": 1,
    "sent": int:epoch
}
```

### >> Pong
```json
{
    "signal": "misc:pong",
    "protocol": 1,
    "sent": int:epoch
}
```

### << Custom Envelope
```json
{
    "signal": "custom:envelope",
    "protocol": 1,
    "sent": int:epoch,
    "kind": string,
    "body": {...}
}
```



# Debugger Server Protocol
Is used between the debugger-server and the debugger-frontend as the proof-of-concept debugger uses a website frontend the debugger-server is a UDP-Broadcast to Websocket proxy.
`>>` means incomming to the debugger-server.
`<<` means outgoing from the debugger-server.
`int:epoch` is in milliseconds.

## Protocol version 1

### >> Construct
The `construct` event tells the server to construct a UDP connector at specific ports.
```json
{
    "event": "construct",
    "signalPort": 9000, // POC implements this filename, recomended to be 'signal_port'
    "commandPort": 9001 // POC implements this filename, recomended to be 'signal_port'
}
```

### >> Configure
The `configure` event tells the server to change ports for its UDP connector.
```json
{
    "event": "configure",
    "signalPort": 9000, // POC implements this filename, recomended to be 'signal_port'
    "commandPort": 9001 // POC implements this filename, recomended to be 'signal_port'
}
```

### >> Send
The `send` event tells the server to forward a message to the app.
```json
{
    "event": "send",
    "msg": {...debugger-signal...} // A constructed signal according to the Debugger Protocol
}
```

### >> Send Constructed
Same as the `send` event but we manually provide `protocol` and `sent` fields.
```json
{
    "event": "send",
    "protocol": 1,
    "sent": int:epoch,
    "msg": {...debugger-signal...} // A constructed signal according to the Debugger Protocol
}
```

### << Receive
The `receive` event is the server forwarding a debugger-signal to the debugger-frontend.
```json
{
    "event": "receive",
    "sent": int:epoch, // When did the server sent the event. (Technically optional but POC assumes it)
    "msg": {...debugger-signal...} // A constructed signal according to the Debugger Protocol
}
```

### >> (ack)Acknowledge (req)Request check
The `ackreq` event asks the server to acknowledge its connection to the debugger-frontend, and also acts as a latency check.
```json
{
    "event": "ackreq",
    "requested": int:epoch // Timestamp when the `ackreq` was sent
}
```

### << (ack)Acknowledge (req)Request - Acknowledgement
The `ackreq.ack` event is the servers acknowledgement of its connection to the debugger-frontend, and fills in the other fields of the latency check.
```json
{
    "event": "ackreq.ack",
    "received": int:epoch, // Timestamp when the `ackreq` was recieved
    "responded": int:epoch, // Timestamp when the `ackreq.ack` was sent
    "_forwarded_": {        // Forwarded is technically optional but due to events not being order-ensured forwarding back the input timestamps helps with latency calculation.
        "requested": int:epoch
    }
}
```