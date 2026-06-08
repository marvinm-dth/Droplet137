const express = require('express')
const app = express()
const port = process.env.PORT || 5050

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(port , ()=> console.log('> Server is up and running on port : ' + port))