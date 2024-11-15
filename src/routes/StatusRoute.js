const express = require('express')
const Router = express.Router()
const StatusController = require('../controllers/StatusController.js')

Router.get('/status', StatusController.lerStatus)
Router.get('/status/:idStatus', StatusController.lerStatusID)
Router.post('/status', StatusController.inserirStatus)
Router.put('/status/:idStatus', StatusController.updateStatus)
Router.delete('/status/:idStatus', StatusController.deleteStatus)

module.exports = Router