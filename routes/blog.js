// Dependencies
let fs = require('fs')
let path = require('path')
let uid = require('uid2')
let jsonfile = require('jsonfile')

// Constants
let IMAGE_DIR_PUBLIC = path.join(__dirname, '/../public/images/')
let IMAGE_TYPES = ['image/jpeg', 'image/png']
let DATA_FILE = path.join(__dirname, '/../data.json')

let blogJson = []

module.exports.index = (req, res, next) => {
  getArticleList(6, false, (articleList) => {
    // sort by by total views
    articleList.sort(function (a, b) {
      return parseFloat(b.views) - parseFloat(a.views)
    })

    res.render('index', {
      articleList: articleList
    })
  })
}

module.exports.new = (req, res, next) => {
  let errors = []

  res.render('create', {
    errors: errors,
    title: '',
    description: ''
  })
}

module.exports.create = (req, res, next) => {
  let writeStream
  let errors = []

  let articleJson = {
    id: uid(22),
    title: '',
    description: '',
    deleted: false,
    fileName: '',
    mimeType: '',
    filePath: '',
    createdon: new Date().toISOString(),
    views: 0,
    comments: []
  }

  req.pipe(req.busboy)

  req.busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
    if (filename) {
      let targetPath
      let targetName
            // get the extenstion of the file
      let extension = filename.split(/[. ]+/).pop()

            // check to see if we support the file type
      if (IMAGE_TYPES.indexOf(mimetype) === -1) {
        errors.push(`Supported image formats: jpeg, jpg, jpe, png.`)
        return file.resume()
      }

            // create a new name for the image
      targetName = uid(22) + '.' + extension

            // determine the new path to save the image
      targetPath = path.join(IMAGE_DIR_PUBLIC + '/', targetName)

      articleJson.fileName = filename
      articleJson.mimeType = mimetype
      articleJson.filePath = '/' + targetName

      writeStream = fs.createWriteStream(targetPath)
      file.pipe(writeStream)
      writeStream.on('close', () => {
                // res.redirect('back');
      })
    } else {
      file.resume()
    }
  })

  req.busboy.on('field', (key, value, keyTruncated, valueTruncated) => {
    if (key === 'title') {
      articleJson.title = value
    }
    if (key === 'description') {
      articleJson.description = value
    }
  })

  req.busboy.on('finish', () => {
    if (!articleJson.title) {
      errors.push('Title is missing.')
    }
    if (!articleJson.description) {
      errors.push('Description is missing.')
    }

    if (errors.length) {
      res.render('create', {
        errors: errors,
        title: articleJson.title,
        description: articleJson.description
      })
    } else {
      blogJson.push(articleJson)

            // Store the TODOs in JSON file used as a database
      jsonfile.writeFile(DATA_FILE, blogJson, {spaces: 2}, (err) => {
        if (err) {
          return res.status(500).send(`Error creating data dir: ${err.message}`)
        }
        res.redirect('/all')
      })
    }
  })
}

module.exports.all = (req, res, next) => {
  getArticleList(0, true, (articleList) => {
    res.render('all', {
      articleList: articleList
    })
  })
}

module.exports.details = (req, res, next) => {
  let id = req.params.id || ''

  getArticleDetails(id, (blogArticle, idx, blogJson) => {
    if (blogArticle !== null) {
      blogJson[idx].views += 1

      jsonfile.writeFile(DATA_FILE, blogJson, {spaces: 2}, (err) => {
        if (err) {
          return res.status(500).send(`Error updating article view counter: ${err.message}`)
        }
        let data = blogArticle
        data.errors = []
        res.render('details', data)
      })
    } else {
      res.render('not_found', {
        title: 'That article doesn\'t exist yet.'
      })
    }
  })
}

// Delete/un-delete article
module.exports.state = (req, res, next) => {
  let id = req.body.articleId || ''

  getArticleDetails(id, (blogArticle, idx, blogJson) => {
    if (blogArticle !== null) {
      blogJson[idx].deleted = !blogArticle.deleted

      jsonfile.writeFile(DATA_FILE, blogJson, {spaces: 2}, (err) => {
        if (err) {
          return res.status(500).send(`Error updating article's state: ${err.message}`)
        }
        res.redirect('/details/' + id)
      })
    } else {
      res.render('not_found', {
        title: 'That article doesn\'t exist yet.'
      })
    }
  })
}

module.exports.addComment = (req, res, next) => {
  let id = req.params.id || ''

  getArticleDetails(id, (blogArticle, idx, blogJson) => {
    if (blogArticle !== null) {
      let errors = []

      let username = req.body.username || ''
      let comment = req.body.comment || ''
      if (!username) {
        errors.push('Your username is required.')
      }
      if (!comment) {
        errors.push('Your comment is required.')
      }

      if (errors.length) {
        let data = blogArticle
        data.errors = errors
        return res.render('details', data)
      }

      blogJson[idx].comments.push({
        username: username,
        comment: comment,
        createdon: new Date().toISOString()
      })

      jsonfile.writeFile(DATA_FILE, blogJson, {spaces: 2}, (err) => {
        if (err) {
          return res.status(500).send(`Error adding article's comment: ${err.message}`)
        }
        res.redirect('/details/' + id)
      })
    } else {
      res.render('not_found', {
        title: 'That article doesn\'t exist yet.'
      })
    }
  })
}

module.exports.stats = (req, res, next) => {
  let authHeader = req.headers['My-Authorization'] || req.headers['my-authorization'] || false

  if (!authHeader || authHeader !== 'Admin') {
    return res.status(404).send(`Access Denied.`)
  }

  getArticleList(0, true, (articleList) => {
    let totalComments = 0
    let totalViews = 0
    if (articleList.length) {
      for (let i = 0; i < articleList.length; i++) {
        totalComments += articleList[i].comments.length || 0
        totalViews += articleList[i].views
      }
    }

    res.status(200).send({
      totalArticles: articleList.length,
      totalComments: totalComments,
      totalViews: totalViews
    })
  })
}

// Not found
module.exports.not_found = function (req, res) {
  res.render('not_found', {
    title: 'That article doesn\'t exist yet.'
  })
}

// Utility functions
function getArticleList (limit, withDeleted, cb) {
  jsonfile.readFile(DATA_FILE, (err, obj) => {
    if (err) {
      jsonfile.writeFileSync(DATA_FILE, blogJson, {spaces: 2})
    } else {
      blogJson = obj
    }

    let activeArticleList = []
    let deletedArticleList = []
    let articleList = []

    if (blogJson.length) {
      for (let i = 0; i < blogJson.length; i++) {
        if (!blogJson[i].deleted) {
          activeArticleList.push(blogJson[i])
        } else {
          deletedArticleList.push(blogJson[i])
        }
      }

      for (let i = 0; i < activeArticleList.length; i++) {
        articleList.push(activeArticleList[i])
      }

      if (withDeleted) {
        for (let i = 0; i < deletedArticleList.length; i++) {
          articleList.push(deletedArticleList[i])
        }
      }
    }

    if (limit) {
      articleList = articleList.slice(0, limit)
    }

    if (typeof cb === 'function') {
      return cb(articleList)
    }
  })
}

function getArticleDetails (id, cb) {
  jsonfile.readFile(DATA_FILE, (err, obj) => {
    if (err) {
      jsonfile.writeFileSync(DATA_FILE, blogJson, {spaces: 2})
    } else {
      blogJson = obj
    }

    let blogArticle = null
    let idx = -1

    if (blogJson.length) {
      for (let i = 0; i < blogJson.length; i++) {
        if (blogJson[i].id === id) {
          if (typeof cb === 'function') {
            blogArticle = blogJson[i]
            idx = i
            break
          }
        }
      }
    }

    if (typeof cb === 'function') {
      return cb(blogArticle, idx, blogJson)
    }
  })
}

