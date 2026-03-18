API Reference
The Dida365 Open API provides a RESTful interface for accessing and managing user tasks, lists, and other related resources. The API is based on the standard HTTP protocol and supports JSON data formats.

Task
Get Task By Project ID And Task ID
GET /open/v1/project/{projectId}/task/{taskId}  
Parameters
Type
Name
Description
Schema
 
Path
projectId required
Project identifier
string
Path
taskId required
Task identifier
string
Responses
HTTP Code
Description
Schema
 
200
OK
Task
401
Unauthorized
No Content
403
Forbidden
No Content
404
Not Found
No Content
Example
Request
GET /open/v1/project/{{projectId}}/task/{{taskId}} HTTP/1.1
Host: api.dida365.com
Authorization: Bearer {{token}}
Response
{  
"id" : "63b7bebb91c0a5474805fcd4",  
"isAllDay" : true,  
"projectId" : "6226ff9877acee87727f6bca",  
"title" : "Task Title",  
"content" : "Task Content",  
"desc" : "Task Description",  
"timeZone" : "America/Los_Angeles",  
"repeatFlag" : "RRULE:FREQ=DAILY;INTERVAL=1",  
"startDate" : "2019-11-13T03:00:00+0000",  
"dueDate" : "2019-11-14T03:00:00+0000",  
"reminders" : [ "TRIGGER:P0DT9H0M0S", "TRIGGER:PT0S" ],  
"priority" : 1,  
"status" : 0,  
"completedTime" : "2019-11-13T03:00:00+0000",  
"sortOrder" : 12345,  
"items" : [ {  
    "id" : "6435074647fd2e6387145f20",  
    "status" : 0,  
    "title" : "Item Title",  
    "sortOrder" : 12345,  
    "startDate" : "2019-11-13T03:00:00+0000",  
    "isAllDay" : false,  
    "timeZone" : "America/Los_Angeles",  
    "completedTime" : "2019-11-13T03:00:00+0000"  
    } ]  
}  
Create Task
POST /open/v1/task  
Parameters
Type
Name
Description
Schema
 
Body
title required
Task title
string
Body
projectId required
Project id
string
Body
content
Task content
string
Body
desc
Description of checklist
string
Body
isAllDay
All day
boolean
Body
startDate
Start date and time in "yyyy-MM-dd'T'HH:mm:ssZ" format
Example : "2019-11-13T03:00:00+0000"
date
Body
dueDate
Due date and time in "yyyy-MM-dd'T'HH:mm:ssZ" format
Example : "2019-11-13T03:00:00+0000"
date
Body
timeZone
The time zone in which the time is specified
String
Body
reminders
Lists of reminders specific to the task
list
Body
repeatFlag
Recurring rules of task
string
Body
priority
The priority of task, default is "0"
integer
Body
sortOrder
The order of task
integer
Body
items
The list of subtasks
list
Body
items.title
Subtask title
string
Body
items.startDate
Start date and time in "yyyy-MM-dd'T'HH:mm:ssZ" format
date
Body
items.isAllDay
All day
boolean
Body
items.sortOrder
The order of subtask
integer
Body
items.timeZone
The time zone in which the Start time is specified
string
Body
items.status
The completion status of subtask
integer
Body
items.completedTime
Completed time in "yyyy-MM-dd'T'HH:mm:ssZ" format
Example : "2019-11-13T03:00:00+0000"
date
Responses
HTTP Code
Description
Schema
 
200
OK
Task
201
Created
No Content
401
Unauthorized
No Content
403
Forbidden
No Content
404
Not Found
No Content
Example
Request
POST /open/v1/task HTTP/1.1
Host: api.dida365.com
Content-Type: application/json
Authorization: Bearer {{token}}
{
    ...
    "title":"Task Title",
    "projectId":"6226ff9877acee87727f6bca"
    ...
}
Response
{  
"id" : "63b7bebb91c0a5474805fcd4",  
"projectId" : "6226ff9877acee87727f6bca",  
"title" : "Task Title",  
"content" : "Task Content",  
"desc" : "Task Description",  
"isAllDay" : true,  
"startDate" : "2019-11-13T03:00:00+0000",  
"dueDate" : "2019-11-14T03:00:00+0000",  
"timeZone" : "America/Los_Angeles",  
"reminders" : [ "TRIGGER:P0DT9H0M0S", "TRIGGER:PT0S" ],  
"repeatFlag" : "RRULE:FREQ=DAILY;INTERVAL=1",  
"priority" : 1,  
"status" : 0,  
"completedTime" : "2019-11-13T03:00:00+0000",  
"sortOrder" : 12345,  
"items" : [ {  
    "id" : "6435074647fd2e6387145f20",  
    "status" : 1,  
    "title" : "Subtask Title",  
    "sortOrder" : 12345,  
    "startDate" : "2019-11-13T03:00:00+0000",  
    "isAllDay" : false,  
    "timeZone" : "America/Los_Angeles",  
    "completedTime" : "2019-11-13T03:00:00+0000"  
    } ]  
}  

Update Task
POST /open/v1/task/{taskId}  
Parameters
Type
Name
Description
Schema
 
Path
taskId required
Task identifier
string
Body
id required
Task id.
string
Body
projectId required
Project id.
string
Body
title
Task title
string
Body
content
Task content
string
Body
desc
Description of checklist
string
Body
isAllDay
All day
boolean
Body
startDate
Start date and time in "yyyy-MM-dd'T'HH:mm:ssZ" format
Example : "2019-11-13T03:00:00+0000"
date
Body
dueDate
Due date and time in "yyyy-MM-dd'T'HH:mm:ssZ" format
Example : "2019-11-13T03:00:00+0000"
date
Body
timeZone
The time zone in which the time is specified
String
Body
reminders
Lists of reminders specific to the task
list
Body
repeatFlag
Recurring rules of task
string
Body
priority
The priority of task, default is "normal"
integer
Body
sortOrder
The order of task
integer
Body
items
The list of subtasks
list
Body
items.title
Subtask title
string
Body
items.startDate
Start date and time in "yyyy-MM-dd'T'HH:mm:ssZ" format
date
Body
items.isAllDay
All day
boolean
Body
items.sortOrder
The order of subtask
integer
Body
items.timeZone
The time zone in which the Start time is specified
string
Body
items.status
The completion status of subtask
integer
Body
items.completedTime
Completed time in "yyyy-MM-dd'T'HH:mm:ssZ" format
Example : "2019-11-13T03:00:00+0000"
date
Responses
HTTP Code
Description
Schema
 
200
OK
Task
201
Created
No Content
401
Unauthorized
No Content
403
Forbidden
No Content
404
Not Found
No Content
Example
Request
POST /open/v1/task/{{taskId}} HTTP/1.1
Host: api.dida365.com
Content-Type: application/json
Authorization: Bearer {{token}}
{
    "id": "{{taskId}}",
    "projectId": "{{projectId}}",
    "title": "Task Title",
    "priority": 1,
    ...
}
Response
{  
"id" : "63b7bebb91c0a5474805fcd4",  
"projectId" : "6226ff9877acee87727f6bca",  
"title" : "Task Title",  
"content" : "Task Content",  
"desc" : "Task Description",  
"isAllDay" : true,  
"startDate" : "2019-11-13T03:00:00+0000",  
"dueDate" : "2019-11-14T03:00:00+0000",  
"timeZone" : "America/Los_Angeles",  
"reminders" : [ "TRIGGER:P0DT9H0M0S", "TRIGGER:PT0S" ],  
"repeatFlag" : "RRULE:FREQ=DAILY;INTERVAL=1",  
"priority" : 1,  
"status" : 0,  
"completedTime" : "2019-11-13T03:00:00+0000",  
"sortOrder" : 12345,  
"items" : [ {  
    "id" : "6435074647fd2e6387145f20",  
    "status" : 1,  
    "title" : "Item Title",  
    "sortOrder" : 12345,  
    "startDate" : "2019-11-13T03:00:00+0000",  
    "isAllDay" : false,  
    "timeZone" : "America/Los_Angeles",  
    "completedTime" : "2019-11-13T03:00:00+0000"  
    } ], 
"kind": "CHECKLIST"
}  

Complete Task
POST /open/v1/project/{projectId}/task/{taskId}/complete  
Parameters
Type
Name
Description
Schema
 
Path
projectId required
Project identifier
string
Path
taskId required
Task identifier
string
Responses
HTTP Code
Description
Schema
 
200
OK
No Content
201
Created
No Content
401
Unauthorized
No Content
403
Forbidden
No Content
404
Not Found
No Content
Example
Request
POST /open/v1/project/{{projectId}}/task/{{taskId}}/complete HTTP/1.1
Host: api.dida365.com
Authorization: Bearer {{token}}
Delete Task
DELETE /open/v1/project/{projectId}/task/{taskId}
Parameters
Type
Name
Description
Schema
 
Path
projectId required
Project identifier
string
Path
taskId required
Task identifier
string
Responses
HTTP Code
Description
Schema
 
200
OK
No Content
201
Created
No Content
401
Unauthorized
No Content
403
Forbidden
No Content
404
Not Found
No Content
Example
Request
DELETE /open/v1/project/{{projectId}}/task/{{taskId}} HTTP/1.1
Host: api.dida365.com
Authorization: Bearer {{token}}
Move Task
POST /open/v1/task/move
Moves one or more tasks between projects.

Request Body
A JSON array containing task move operations.

Type
Name
Description
Schema
 
Body
fromProjectId required
The ID of the source project
string
Body
toProjectId required
The ID of the destination project
string
Body
taskId required
The ID of the task to move
string
Responses
HTTP Code
Description
Schema
 
200
OK
Returns an array of move results, including the task ID and its new etag)
201
Created
No Content
401
Unauthorized
No Content
403
Forbidden
No Content
404
Not Found
No Content
Example
Request
POST /open/v1/task/move HTTP/1.1
Host: api.dida365.com
Authorization: Bearer {{token}}
[
  {
    "fromProjectId":"69a850ef1c20d2030e148fdd",
    "toProjectId":"69a850f41c20d2030e148fdf",
    "taskId":"69a850f8b9061f374d54a046"
  }
]
Response
[
  {
    "id": "69a850f8b9061f374d54a046",
    "etag": "43p2zso1"
  }
]
List Completed Tasks
POST /open/v1/task/completed
Retrieves a list of tasks marked as completed within specific projects and a given time range.

Request Body
A JSON object containing filter criteria. All fields are optional, but at least one filter is recommended to narrow down results.

Type
Name
Description
Schema
 
Body
projectIds
List of project identifier
list
Body
startDate
The start of the time range (inclusive). Filters tasks where completedTime ≥ startDate
date
Body
endDate
The end of the time range (inclusive). Filters tasks where completedTime ≤ endDate
date
Responses
HTTP Code
Description
Schema
 
200
OK
< Task > array
201
Created
No Content
401
Unauthorized
No Content
403
Forbidden
No Content
404
Not Found
No Content
Example
Request
POST /open/v1/task/completed HTTP/1.1
Host: api.dida365.com
Authorization: Bearer {{token}}
{
  "projectIds": [
    "69a850f41c20d2030e148fdf"
  ],
  "startDate":"2026-03-01T00:58:20.000+0000",
  "endDate":"2026-03-05T10:58:20.000+0000"
}
Response
[
  {
    "id": "69a850f8b9061f374d54a046",
    "projectId": "69a850f41c20d2030e148fdf",
    "sortOrder": -1099511627776,
    "title": "update",
    "content": "",
    "timeZone": "America/Los_Angeles",
    "isAllDay": false,
    "priority": 0,
    "completedTime": "2026-03-04T23:58:20.000+0000",
    "status": 2,
    "etag": "t3kc5m5f",
    "kind": "TEXT"
  }
]
Filter Tasks
POST /open/v1/task/filter
Retrieves a list of tasks based on advanced filtering criteria, including project scope, date ranges, priority levels, tags, and status.

Parameters
Type
Name
Description
Schema
 
Body
projectIds
Filters tasks belonging to the specified project ID
list
Body
startDate
Filters tasks where the task's startDate ≥ startDate
date
Body
endDate
Filters tasks where the task's startDate ≤ endDate
date
Body
proiority
Filters tasks by specific priority levels, Valid Values: None(0), Low(1), Mediunm(3), High(5)
list
Body
tag
Filters tasks that contain all of the specified tags
list
Body
status
Filters tasks by their current status codes (e.g., [0] for Open, [2] for Completed)
list
Responses
HTTP Code
Description
Schema
 
200
OK
< Task > array
201
Created
No Content
401
Unauthorized
No Content
403
Forbidden
No Content
404
Not Found
No Content
Example
Request
POST /open/v1/task/filter HTTP/1.1
Host: api.dida365.com
Authorization: Bearer {{token}}
{
  "projectIds": [
    "69a850f41c20d2030e148fdf"
  ],
  "startDate":"2026-03-01T00:58:20.000+0000",
  "endDate":"2026-03-06T10:58:20.000+0000",
  "priority": [0],
  "tag": ["urgent"],
  "status": [0]
}
Response
[
  {
    "id": "69a85785b9061f3c217e9de6",
    "projectId": "69a850f41c20d2030e148fdf",
    "sortOrder": -2199023255552,
    "title": "task1",
    "content": "",
    "desc": "",
    "startDate": "2026-03-05T00:00:00.000+0000",
    "dueDate": "2026-03-05T00:00:00.000+0000",
    "timeZone": "America/Los_Angeles",
    "isAllDay": false,
    "priority": 0,
    "status": 0,
    "tags": [
      "tag"
    ],
    "etag": "cic6e3cg",
    "kind": "TEXT"
  },
  {
    "id": "69a8ea79b9061f4d803f6b32",
    "projectId": "69a850f41c20d2030e148fdf",
    "sortOrder": -3298534883328,
    "title": "task2",
    "content": "",
    "startDate": "2026-03-05T00:00:00.000+0000",
    "dueDate": "2026-03-05T00:00:00.000+0000",
    "timeZone": "America/Los_Angeles",
    "isAllDay": false,
    "priority": 0,
    "status": 0,
    "tags": [
      "tag"
    ],
    "etag": "0nvpcxzh",
    "kind": "TEXT"
  }
]
Project
Get User Project
GET /open/v1/project
Responses
HTTP Code
Description
Schema
 
200
OK
< Project > array
401
Unauthorized
No Content
403
Forbidden
No Content
404
Not Found
No Content
Example
Request
GET /open/v1/project HTTP/1.1
Host: api.dida365.com
Authorization: Bearer {{token}}
Response
[{
"id": "6226ff9877acee87727f6bca",
"name": "project name",
"color": "#F18181",
"closed": false,
"groupId": "6436176a47fd2e05f26ef56e",
"viewMode": "list",
"permission": "write",
"kind": "TASK"
}]
Get Project By ID
GET /open/v1/project/{projectId}
Parameters
Type
Name
Description
Schema
 
Path
project required
Project identifier
string
Responses
HTTP Code
Description
Schema
 
200
OK
Project
401
Unauthorized
No Content
403
Forbidden
No Content
404
Not Found
No Content
Example
Request path
GET /open/v1/project/{{projectId}} HTTP/1.1
Host: api.dida365.com
Authorization: Bearer {{token}}
Response
{
    "id": "6226ff9877acee87727f6bca",
    "name": "project name",
    "color": "#F18181",
    "closed": false,
    "groupId": "6436176a47fd2e05f26ef56e",
    "viewMode": "list",
    "kind": "TASK"
}
Get Project With Data
GET /open/v1/project/{projectId}/data
Parameters
Type
Name
Description
Schema
 
Path
projectId required
Project identifier, "inbox"
string
Responses
HTTP Code
Description
Schema
 
200
OK
ProjectData
401
Unauthorized
No Content
403
Forbidden
No Content
404
Not Found
No Content
Example
Request
GET /open/v1/project/{{projectId}}/data HTTP/1.1
Host: api.dida365.com
Authorization: Bearer {{token}}
Response
{
"project": {
    "id": "6226ff9877acee87727f6bca",
    "name": "project name",
    "color": "#F18181",
    "closed": false,
    "groupId": "6436176a47fd2e05f26ef56e",
    "viewMode": "list",
    "kind": "TASK"
},
"tasks": [{
    "id": "6247ee29630c800f064fd145",
    "isAllDay": true,
    "projectId": "6226ff9877acee87727f6bca",
    "title": "Task Title",
    "content": "Task Content",
    "desc": "Task Description",
    "timeZone": "America/Los_Angeles",
    "repeatFlag": "RRULE:FREQ=DAILY;INTERVAL=1",
    "startDate": "2019-11-13T03:00:00+0000",
    "dueDate": "2019-11-14T03:00:00+0000",
    "reminders": [
        "TRIGGER:P0DT9H0M0S",
        "TRIGGER:PT0S"
    ],
    "priority": 1,
    "status": 0,
    "completedTime": "2019-11-13T03:00:00+0000",
    "sortOrder": 12345,
    "items": [{
        "id": "6435074647fd2e6387145f20",
        "status": 0,
        "title": "Subtask Title",
        "sortOrder": 12345,
        "startDate": "2019-11-13T03:00:00+0000",
        "isAllDay": false,
        "timeZone": "America/Los_Angeles",
        "completedTime": "2019-11-13T03:00:00+0000"
    }]
}],
"columns": [{
    "id": "6226ff9e76e5fc39f2862d1b",
    "projectId": "6226ff9877acee87727f6bca",
    "name": "Column Name",
    "sortOrder": 0
}]
}
Create Project
POST /open/v1/project
Parameters
Type
Name
Description
Schema
 
Body
name required
name of the project
string
Body
color
color of project, eg. "#F18181"
string
Body
sortOrder
sort order value of the project
integer (int64)
Body
viewMode
view mode, "list", "kanban", "timeline"
string
Body
kind
project kind, "TASK", "NOTE"
string
Responses
HTTP Code
Description
Schema
 
200
OK
Project
201
Created
No Content
401
Unauthorized
No Content
403
Forbidden
No Content
404
Not Found
No Content
Example
Request
POST /open/v1/project HTTP/1.1
Host: api.dida365.com
Content-Type: application/json
Authorization: Bearer {{token}}
{
    "name": "project name",
    "color": "#F18181",
    "viewMode": "list",
    "kind": "task"
}
Response
{
"id": "6226ff9877acee87727f6bca",
"name": "project name",
"color": "#F18181",
"sortOrder": 0,
"viewMode": "list",
"kind": "TASK"
}
Update Project
POST /open/v1/project/{projectId}
Parameters
Type
Parameter
Description
Schema
 
Path
projectId required
project identifier
string
Body
name
name of the project
string
Body
color
color of the project
string
Body
sortOrder
sort order value, default 0
integer (int64)
Body
viewMode
view mode, "list", "kanban", "timeline"
string
Body
kind
project kind, "TASK", "NOTE"
string
Responses
HTTP Code
Description
Schema
 
200
OK
Project
201
Created
No Content
401
Unauthorized
No Content
403
Forbidden
No Content
404
Not Found
No Content
Example
Request
POST /open/v1/project/{{projectId}} HTTP/1.1
Host: api.dida365.com
Content-Type: application/json
Authorization: Bearer {{token}}

{
    "name": "Project Name",
    "color": "#F18181",
    "viewMode": "list",
    "kind": "TASK"
}
Response
{
"id": "6226ff9877acee87727f6bca",
"name": "Project Name",
"color": "#F18181",
"sortOrder": 0,
"viewMode": "list",
"kind": "TASK"
}
Delete Project
DELETE /open/v1/project/{projectId}
Parameters
Type
Name
Description
Schema
 
Path
projectId required
Project identifier
string
Responses
HTTP Code
Description
Schema
 
200
OK
No Content
401
Unauthorized
No Content
403
Forbidden
No Content
404
Not Found
No Content
Example
Request
DELETE /open/v1/project/{{projectId}} HTTP/1.1
Host: api.dida365.com
Authorization: Bearer {{token}}
Definitions
ChecklistItem
Name
Description
Schema
 
id
Subtask identifier
string
title
Subtask title
string
status
The completion status of subtask
Value : Normal: 0, Completed: 1
integer (int32)
completedTime
Subtask completed time in "yyyy-MM-dd'T'HH:mm:ssZ"
Example : "2019-11-13T03:00:00+0000"
string (date-time)
isAllDay
All day
boolean
sortOrder
Subtask sort order
Example : 234444
integer (int64)
startDate
Subtask start date time in "yyyy-MM-dd'T'HH:mm:ssZ"
Example : "2019-11-13T03:00:00+0000"
string (date-time)
timeZone
Subtask timezone
Example : "America/Los_Angeles"
string
Task
Name
Description
Schema
 
id
Task identifier
string
projectId
Task project id
string
title
Task title
string
isAllDay
All day
boolean
completedTime
Task completed time in "yyyy-MM-dd'T'HH:mm:ssZ"
Example : "2019-11-13T03:00:00+0000"
string (date-time)
content
Task content
string
desc
Task description of checklist
string
dueDate
Task due date time in "yyyy-MM-dd'T'HH:mm:ssZ"
Example : "2019-11-13T03:00:00+0000"
string (date-time)
items
Subtasks of Task
< ChecklistItem > array
priority
Task priority
Value : None:0, Low:1, Medium:3, High5
integer (int32)
reminders
List of reminder triggers
Example : [ "TRIGGER:P0DT9H0M0S", "TRIGGER:PT0S" ]
< string > array
repeatFlag
Recurring rules of task
Example : "RRULE:FREQ=DAILY;INTERVAL=1"
string
sortOrder
Task sort order
Example : 12345
integer (int64)
startDate
Start date time in "yyyy-MM-dd'T'HH:mm:ssZ"
Example : "2019-11-13T03:00:00+0000"
string (date-time)
status
Task completion status
Value : Normal: 0, Completed: 2
integer (int32)
timeZone
Task timezone
Example : "America/Los_Angeles"
string
kind
"TEXT", "NOTE", "CHECKLIST"
string
Project
Name
Description
Schema
 
id
Project identifier
string
name
Project name
string
color
Project color
string
sortOrder
Order value
integer (int64)
closed
Projcet closed
boolean
groupId
Project group identifier
string
viewMode
view mode, "list", "kanban", "timeline"
string
permission
"read", "write" or "comment"
string
kind
"TASK" or "NOTE"
string
Column
Name
Description
Schema
 
id
Column identifier
string
projectId
Project identifier
string
name
Column name
string
sortOrder
Order value
integer (int64)
ProjectData
Name
Description
Schema
 
project
Project info
Project
tasks
Undone tasks under project
<Task> array
columns
Columns under project
<Column> array
Feedback and Support