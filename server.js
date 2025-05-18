const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Path ke database.json
const DB_PATH = path.join(__dirname, 'database.json');

// Gunakan middleware untuk file statis (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(cors({ credentials: true, origin: 'http://localhost:5173' }));
app.use(cookieParser());
app.use(bodyParser.json());

// Helper: Baca database
function readDB() {
    return fs.readJSONSync(DB_PATH);
}

// Helper: Simpan database
function writeDB(data) {
    return fs.writeJSONSync(DB_PATH, data, { spaces: 2 });
}

// Middleware untuk autentikasi
function authenticate(req, res, next) {
    const { userId } = req.body;
    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) {
        return res.status(401).json({ message: 'User not found' });
    }
    req.user = user;
    next();
}

// Route API

// Register
app.post('/api/register', (req, res) => {
    const { username, password, bio, profilePic } = req.body;
    const db = readDB();
    if (db.users.some(u => u.username === username)) {
        return res.status(400).json({ message: 'Username already exists' });
    }
    const newUser = {
        id: Date.now().toString(),
        username,
        password,
        email: `${username}@example.com`,
        profilePic: profilePic || '/api/placeholder/200/200',
        bio: bio || '',
        followers: [],
        following: [],
        stories: [],
        joinDate: new Date().toISOString()
    };
    db.users.push(newUser);
    writeDB(db);
    res.json({
        id: newUser.id,
        username: newUser.username,
        bio: newUser.bio,
        profilePic: newUser.profilePic,
        followers: newUser.followers,
        following: newUser.following
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }
    res.json({ user });
});

// Get all stories (public)
app.get('/api/stories', (req, res) => {
    const db = readDB();
    res.json(db.stories);
});

// Get story by ID
app.get('/api/stories/:id', (req, res) => {
    const db = readDB();
    const story = db.stories.find(s => s.id === req.params.id);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    res.json(story);
});

// Add comment to story
app.post('/api/stories/:id/comments', (req, res) => {
    const { userId, author, content } = req.body;
    const db = readDB();
    const story = db.stories.find(s => s.id === req.params.id);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    const newComment = {
        id: Date.now().toString(),
        userId,
        author,
        content,
        createdAt: new Date().toISOString()
    };
    story.comments.push(newComment);
    writeDB(db);
    res.json({ message: 'Comment added successfully' });
});

// Like / Unlike a story
app.post('/api/stories/:id/like', (req, res) => {
    const { userId, action } = req.body;
    const db = readDB();
    const story = db.stories.find(s => s.id === req.params.id);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    let likes = story.likes || 0;
    let likedBy = story.likedBy || [];
    if (action === 'like') {
        if (!likedBy.includes(userId)) {
            likedBy.push(userId);
            likes += 1;
        }
    } else if (action === 'unlike') {
        likedBy = likedBy.filter(id => id !== userId);
        likes -= 1;
    }
    story.likedBy = likedBy;
    story.likes = likes;
    writeDB(db);
    res.json({ likes });
});

// Upload story
app.post('/api/stories', (req, res) => {
    const { title, content, genre, coverImage, authorId, author } = req.body;
    if (!title || !content || !authorId || !author) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    const db = readDB();
    const newStory = {
        id: Date.now().toString(),
        title,
        content,
        genre,
        coverImage,
        authorId,
        author,
        authorAvatar: db.users.find(u => u.id === authorId)?.profilePic || '/api/placeholder/200/200',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        likes: 0,
        likedBy: [],
        views: 0,
        comments: []
    };
    db.stories.push(newStory);
    // Update user's stories list
    const user = db.users.find(u => u.id === authorId);
    if (user) {
        user.stories.push(newStory.id);
    }
    writeDB(db);
    res.json({ message: 'Story published successfully!', story: newStory });
});

// Get user profile
app.get('/api/users/:id', (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const userStories = db.stories.filter(s => s.authorId === req.params.id);
    res.json({
        ...user,
        stories: userStories
    });
});

// Edit profile
app.put('/api/users/:id', (req, res) => {
    const { username, bio, profilePic } = req.body;
    const db = readDB();
    const userIndex = db.users.findIndex(u => u.id === req.params.id);
    if (userIndex === -1) return res.status(404).json({ message: 'User not found' });
    db.users[userIndex].username = username;
    db.users[userIndex].bio = bio;
    db.users[userIndex].profilePic = profilePic;
    writeDB(db);
    res.json({ message: 'Profile updated successfully', user: db.users[userIndex] });
});

// Follow / Unfollow user
app.post('/api/follow', (req, res) => {
    const { userId, targetId, action } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    const target = db.users.find(u => u.id === targetId);
    if (!user || !target) return res.status(404).json({ message: 'User not found' });
    if (action === 'follow') {
        if (!user.following.includes(targetId)) {
            user.following.push(targetId);
        }
        if (!target.followers.includes(userId)) {
            target.followers.push(userId);
        }
    } else if (action === 'unfollow') {
        user.following = user.following.filter(id => id !== targetId);
        target.followers = target.followers.filter(id => id !== userId);
    }
    writeDB(db);
    res.json({ message: `Successfully ${action}ed`, user });
});

// Jalankan server
app.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
});
