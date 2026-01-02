# Debugger Protocol
Is used between the app and any debuggers.
All messages have the field "signal" which contains the type of message and the field "protocol" which is the protocol version.
The protocol uses UDP in broadcast mode to emitt signals no matter a listener.
`>>` means incomming to the app.
`<<` means outgoing from the app.
`int:epoch` is in milliseconds.

## Protocol version 1

### << Console Log
App emitts a message to the receiver.
```json
{
    "signal": "console:log",
    "protocol": 1,
    "sent": int:epoch,
    "type": "string:logtype" | int:loglevel, // The log type: `DEBUG` / 0    `INFO` / 1    `WARN` / 2    `ERROR` / 3    `UNKNOWN`
    "text": "string", // The log message
    "object": {...} | NULL // Optional JSON object for context
}
```

### >> Console In
Receiver emitts a message to the app. (Possibly a command)
```json
{
    "signal": "console:in",
    "protocol": 1,
    "sent": int:epoch,
    "cmd": "string",
    "object": {...} | NULL // Optional JSON object for context
}
```

### << Elements Tree
App emitts a tree of elements and their properties.
```json
{
    "signal": "elements:tree",
    "protocol": 1,
    "sent": int:epoch,
    "tree": [...TREE...] // Array of tree objects (tree of nodes)
}
```
TREE: The objects fields are node properties, the protocol recommends having atleast "id" and "type" but this is up to the protocol implementor, all objects can otherwise be identified by an array of indexes to reach it or if given it's id or an id of a parent/grandparent and the indexes path from it. Each object may have a field "children" this is a list of more objects. (this is the only tree field whos implementation is static and known)

### << Elements Update
App emitts it has an update for an element, fields here are only the updated fields that should be updated on the receiver, and can't include "children" field nor "id" field.
```json
{
    "signal": "elements:update",
    "protocol": 1,
    "sent": int:epoch,
    "element": "string" | [int:indexes,...],
    "properties": {...}
}
```

### >> Elements Mod
Recieiver emitts that it want to update a property of an element.
```json
{
    "signal": "elements:mod",
    "protocol": 1,
    "sent": int:epoch,
    "element": "string" | [int:indexes,...],
    "property": any,
    "value": any
}
```

### << Net Create
App emitts that it is creating a network event
```json
{
    "signal": "net:start",
    "protocol": 1,
    "sent": int:epoch,
    "properties": {...NETEVENT...}
}
```
NETEVENT: (Except for `net:start` all fields are optional and id allowed)
```json
{
    "id": "string",
    "context": "string", // Optional context string
    "initiator": "string" | [int:indexes,...], // Optional element identifier
    "method": "string:httpmethod", // The HTTP method: GET, POST, PUT, DELETE, PATCH, HEAD, CONNECT, OPTIONS, TRACE
    "priority": "string:priority", // The net-priority of this event
    "meta_buffer_size": int, // <0 for unknown
    "meta_is_stream": bool, // Is this request streamed?
    "meta_as_file": bool, // Is this request being written to file
    "meta_direction": "outgoing" | "incomming", // "outgoing" is app fetches/downloads something; "incomming" is app receives a network connection from somwhere else
    "meta_speed": float, // <0 for unknown, in Mbit/s
    "meta_time_to_con": int, // Nanoseconds, duration until connection
    "meta_time_to_first_byte": int, // Nanoseconds, duration until first byte received
    "meta_got_first_resp": string, // When did we get the first response ("YYYY-MM-DDThh:mm:ssZ")
    "meta_retry_attempt": int, // The numbers of attempts made (1 is first attempt)
    "status": int, // The current HTTP status
    "client_ip": string:IP, // IP making the request
    "remote": string, // Remote address of the request
    "remote_ip": string:IP, // IP of the remote
    "protocol": string, // Web protocol for the request
    "scheme": string, // Scheme of the request (HTTP/HTTPS etc.)
    "content_type": string, // MIME type of response content
    "headers": {...}, // Headers sent with the request
    "resp_headers": {...}, // Headers in response
    "transferred": int, // How many bytes have been transferred
    "size": int, // What is the expected size of the response content, -1 if unknown
    "event_state": string:EventState, // The state of the network event: "waiting", "paused", "retry", "established", "responded", "transfer", "finished"
    "event_success": bool, // Is the event result successfull?
    "event_step_current": int | NULL, // If the event is stepped in progress what is the current step
    "event_step_max": int | NULL, // If the event is stepped in progress what is the amax step
    "event_step_mode": "auto" | "manual" // Is step automatically determined by transferred/size
}
```

### << Net Update
App emitts that it has a new state for a previous network event, either all fields or only the updated ones are sent, depending on how trackable the "id"s are.
```json
{
    "signal": "net:update",
    "protocol": 1,
    "sent": int:epoch,
    "id": int:netevent.id,
    "properties": {...NETEVENT...}
}
```

### << Net Stop
App emitts that a previous network event has ended, this is different from net:update setting event_status to "finished" as this declares the event is no longer relevant. (Can be implemented as a remove/destroy but this is not specced)
```json
{
    "signal": "net:stop",
    "protocol": 1,
    "sent": int:epoch,
    "id": int:netevent.id
}
```

### << Net Stop + Update
This is a special event added as a work arround for a bug, it provides updated fields and tells the receiver to update the state of an event and then stop it.
```json
{
    "signal": "net:stop.update",
    "protocol": 1,
    "sent": int:epoch,
    "id": int:netevent.id,
    "properties": {...NETEVENT...}
}
```

### << Usage Stats
App emitts it's system resource usage and other debugging information.
```json
{
    "signal": "usage:stats",
    "protocol": 1,
    "sent": int:epoch,
    "stats": {...USAGESTATS...}
}
```
USAGESTATS: (Current Proof-Of-Concept fields-list)
```json
{
    "pid": int,
    "name": string,
    "status": [string,...],
    "cmdline": string,
    "args": [string,...],
    "exe": string,
    "cwd": string,
    "create_time": int,
    "username": string,
    "uids": [int,...],
    "gids": [int,...],
    "groups": [int,...],
    "cpu_percent": float,
    "memory_percent": float,
    "memory_rss": int,
    "memory_vms": int,
    "io_read_bytes": int,
    "io_write_bytes": int,
    "num_fds": int,
    "num_threads": int,
    "thread_count": int,
    "threads": {
        int: {
            "user": float,
            "system": float,
            "idle": float,
            "nice": float,
            "iowait": float,
            "irq": float,
            "softirq": float,
            "steal": float,
            "guest": float,
            "guestn_nice": float
        },
        ...
    },
    "num_ctx_switches_voluntary": int,
    "num_ctx_switches_involuntary": int,
    "open_files_count": int,
    "open_files": [string,...],
    "nice": int,
    "terminal": string,
    "ppid": int,
    "parent_pid": int,
    "rlimit": [
        {
            "resource": string,
            "name": string,
            "soft": int,
            "hard": int,
            "used": int
        },
        ...
    ],
    "connections": [
        {
            "fd": int,
            "family": int,
            "type": int,
            "laddr_ip": string,
            "laddr_port": int,
            "raddr_ip": string,
            "raddr_port": int,
            "status": string,
            "pid": int
        },
        ...
    ],
    "system_cpu_cores": int,
    "max_memory_total": int,
    "max_io_read_bytes": int,
    "max_io_write_bytes": int,
    "max_num_fds": int,
    "max_num_threads": int
}
```

### << >> Ping
App/Reciever sends a request for connection agknowledgement.
```json
{
    "signal": "misc:ping",
    "protocol": 1,
    "sent": int:epoch
}
```

### << >> Pong
App/Reciever sends a response to a `ping` signal, agknowledgeing the connection.
```json
{
    "signal": "misc:pong",
    "protocol": 1,
    "sent": int:epoch,
    "_forwarded_": {        // Forwarded is technically optional but due to events not being order-ensured forwarding back the input timestamps helps with latency calculation.
        "requested": int:epoch
    }
}
```

### << >> Custom Envelope
Custom signals can be sent over a strictly validated connection by using the `custom:envelope` signal.
```json
{
    "signal": "custom:envelope",
    "protocol": 1,
    "sent": int:epoch,
    "kind": string, // The custom signal id
    "body": {...}   // The signal body
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
    "received": int:epoch, // Timestamp when the `ackreq` was received
    "responded": int:epoch, // Timestamp when the `ackreq.ack` was sent
    "_forwarded_": {        // Forwarded is technically optional but due to events not being order-ensured forwarding back the input timestamps helps with latency calculation.
        "requested": int:epoch
    }
}
```