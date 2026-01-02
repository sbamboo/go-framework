Socket protocol for bidirectional JSON,
all messages have the field "signal" which contains the type of message and the field "protocol" which is the protocol version.

Example could be
```json
{
    "protocol": 1,
    "sent": <epoch:timestamp>,
    "signal": "console:log",
    "type": "info",
    "text": "Hello world",
    "object": {...JSON-obj...}
}
```
In this instance we are loggin the text "Hello World" within the console context, this could be displayed as a line in a console, and display some JSON bellow, but the protocol should not care about representation just that there is some signal "log" in the "console" context that has the fields "type", "text", and "object" and their types and possible values, "type" being a string-literal, "text" being any string and "object" being more data or None.


One important thing is that the protocol does not care if it is being read, it just emmits the signals.

Here are the signals im thinking about "->" means client sends to reciever and "<-" means reciever sends to client.
-> "console:log" // Client emitts a message to the reciever
```json
{
    "protocol": 1,
    "sent": <epoch:timestamp>,
    "signal": "console:log",
    "type": "info" | "warn" | "error",
    "text": "<string>",
    "object": {...JSON-object...} | None
}
```

<- "console:in"    // Reciever emitts a message to the client (possibly a command)
```json
{
    "protocol": 1,
    "sent": <epoch:timestamp>,
    "signal": "console:in",
    "text": "<string>",
    "object": {...JSON-object...} | None
}
```

-> "elements:tree" // Client emitts a tree of elements and their properties
```json
{
    "protocol": 1,
    "sent": <epoch:timestamp>,
    "signal": "elements:tree",
    "tree": [...tree...] // List of JSON-object:s, the objects fields are their properties, the protocol recommends having atleast "id" and "type" but this is up to the protocol implementor, all objects can otherwise be identified by an array of indexes to reach it or if given it's id or an id of a parent/grandparent and the indexes path from it. Each object may have a field "children" this is a list of more objects. (this is the only tree field whos implementation is static and known.
}
```

<- "elements:mod" // Recieiver emitts that it want to update a property of an element
```json
{
    "protocol": 1,
    "sent": <epoch:timestamp>,
    "signal": "elements:mod",
    "element": "<id>" | [...indexes...]
    "property": "<property>",
    "value": <any:value>
}
```

-> "elements:update" // Client emitts it has an update for an element, fields here are only the updated fields that should be updated on the reciever, and can't include "children" field nor "id" field. 
```json
{
    "protocol": 1,
    "sent": <epoch:timestamp>,
    "signal": "elements:update",
    "element": "<id>" | [...indexes...],
    "properties": {...fields...}
}
```

-> "net:start" // Client emitts that it is creating a network event
```json
{
    "protocol": 1,
    "sent": <epoch:timestamp>,
    "signal": "net:start",
    "properties":  {
        "id": "<identifier>",
        "context": "<string>" | None, 
        "status": <int:http-status>,
        "method": "<http-method>",
        "direction": "outgoing" | "incomming", // "outgoing" is client fetches/downloads something; "incomming" is client recieves a network connection from somwhere else
        "remote": "<domain-or-ip>",
        "schema": "<net-schema>", // example "http" or "https"
        "net_protocol": "<net-protocol>", // example "HTTP/2"
        "content_type": "<content-type>", // example "application/json"
        "transfered": <int:transfered>, // Bytes
        "size": <int:size>, // Bytes
        "is_stream": <bool>, // If not it is not a stream
        "headers": {...}, 
        "cookies": {...}, 
        "client_port": "<port>", // The clients port
        "remote_port": "<port>" // The port on the other end
        "initiator": "<string>" | <element:"<id>" | [...indexes...]>,
        "event_status": "waiting"/"active"/"paused"/"finished", //"waiting" can be event is created but waiting to be started, "active" is in progress, "paused" is event is paused, "finished" event has processed
        "event_success": None | <bool>, // None when not finished, else is weather event was successfull, this can be set even when status is not finished example is if fails during progress.
        "event_step_current": None | <int>, // If client aside from transfered/size want to provide a step number or procentage finished, this is the current 
        "event_step_max": None | <int> // If client aside from transfered/size want to provide a step number or procentage finished, this is the max
    }
}
```

-> "net:update" // Client emitts that it has a new state for a previous network event
```json
{
    "protocol": 1,
    "sent": <epoch:timestamp>,
    "signal": "net:update",
    "id": "<string>", // the network event this applies to
    "properties": {...fields...}
}
```

// Fields are field we want to update, and includes only the fields that have changed (or otherwise should be updated) but can not include the "id" field.

-> "net:stop" // Client emitts that a previous network event has ended, this is different from net:update setting event_status to "finished" as this declares the event is no longer relevant. Will most likely be implemented as a remove/destroy but this is not specced.
```json
{
    "protocol": 1,
    "sent": <epoch:timestamp>,
    "signal": "net:stop",
    "id": "<string>", // the network event this applies to}
}
```

-> "usage:stat" // Client emitts a log of its system resource usage
```json
{
    "protocol": 1,
    "sent": <epoch:timestamp>,
    "signal": "usage:state",
    "stats": {...metrics...}
}
```
Metrics is the field mapped to either a value or an array of two values, example
`"stats": {"cpus":[1,2]}` One out of two cpus are used
or
`"stats": {"hostname": "DESKTOP1"}` The hostname is DESKTOP1


-> "misc:ping" // Client sends a request for connection agknowledgement
```json
{
    "protocol": 1,
    "sent": <epoch:timestamp>,
    "signal": "misc:ping"
}
```

<- "misc:pong" // Reciever agknowledges a connection check
```json
{
    "protocol": 1,
    "sent": <epoch:timestamp>,
    "signal": "misc:pong"
}
```

Finally for custom signals one can use the envelope signal
```json
{
    "protocol": 1,
    "sent": <epoch:timestamp>,
    "signal": "custom:envelope",
    "kind": "<string:name-of-signal>", // Ex "notification"
    "body": {...JSON-object...}
}
```