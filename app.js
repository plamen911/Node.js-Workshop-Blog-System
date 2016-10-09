let express = require('express')
let bodyParser = require('body-parser')

let path = require('path')
let busboy = require('connect-busboy')

// New express application
let app = express()
app.set('view engine', 'ejs')

let port = process.env.PORT || 3000

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({
  extended: false
}))

// Tell express where to find static assets
app.use(express.static(path.join(__dirname, 'public')))

app.use(busboy())

// Routes
let blog = require('./routes/blog')

app.get('/', blog.index)
app.get('/create', blog.new)
app.post('/create', blog.create)
app.get('/all', blog.all)
app.get('/details/:id?', blog.details)
app.post('/state', blog.state)
app.post('/details/:id/comment?', blog.addComment)
app.get('/stats', blog.stats)
app.get('*', blog.not_found)

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
