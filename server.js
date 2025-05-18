const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html and story.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/story', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'story.html'));
});

// Database
const DB_PATH = path.join(__dirname, 'database.json');

function readDB() {
    const data = fs.readFileSync(DB_PATH);
    return JSON.parse(data);
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.username === username && u.password === password);

    if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    res.json({ user });
});

// Register
app.post('/api/register', (req, res) => {
    const { username, password, bio } = req.body;
    const db = readDB();

    const existingUser = db.users.find(u => u.username === username);
    if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
    }

    const newUser = {
        id: Date.now(),
        username,
        password,
        bio: bio || "",
        profilePic: "/api/placeholder/100/100",
        followers: 0,
        following: 0
    };

    db.users.push(newUser);
    writeDB(db);
    res.json({ user: newUser });
});

// Stories
app.get('/api/stories', (req, res) => {
    const type = req.query.type || 'recent';
    const db = readDB();
    let stories = [...db.stories];

    if (type === 'trending') {
        stories.sort((a, b) => {
            const aLikes = db.likes.filter(l => l.storyId === a.id).length;
            const bLikes = db.likes.filter(l => l.storyId === b.id).length;
            return bLikes - aLikes;
        });
    } else {
        stories.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    stories = stories.map(story => {
        const author = db.users.find(u => u.id === story.authorId);
        return { ...story, author };
    });

    res.json({ stories });
});

app.get('/api/stories/search', (req, res) => {
    const query = req.query.q.toLowerCase();
    const db = readDB();
    const filteredStories = db.stories.filter(s =>
        s.title.toLowerCase().includes(query) ||
        s.content.toLowerCase().includes(query)
    );
    res.json({ stories: filteredStories });
});

app.get('/api/stories/:id', (req, res) => {
    const storyId = parseInt(req.params.id);
    const db = readDB();
    const story = db.stories.find(s => s.id === storyId);
    if (!story) {
        return res.status(404).json({ message: "Story not found" });
    }
    const author = db.users.find(u => u.id === story.authorId);
    res.json({ story: { ...story, author } });
});

app.post('/api/stories', (req, res) => {
    const { title, content, authorId } = req.body;
    const db = readDB();
    const newStory = {
        id: Date.now(),
        title,
        content,
        coverImage: "/api/placeholder/800/400",
        createdAt: new Date().toISOString(),
        authorId
    };
    db.stories.push(newStory);
    writeDB(db);
    res.json({ story: newStory });
});

// Likes
app.post('/api/stories/:id/like', (req, res) => {
    const storyId = parseInt(req.params.id);
    const { userId } = req.body;
    const db = readDB();

    const existingLike = db.likes.find(l => l.storyId === storyId && l.userId === userId);
    if (existingLike) {
        db.likes = db.likes.filter(l => !(l.storyId === storyId && l.userId === userId));
    } else {
        db.likes.push({ storyId, userId });
    }

    writeDB(db);
    res.json({ liked: !existingLike });
});

app.get('/api/stories/:id/like/:userId', (req, res) => {
    const storyId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);
    const db = readDB();
    const liked = db.likes.some(l => l.storyId === storyId && l.userId === userId);
    res.json({ liked });
});

// Comments
app.get('/api/comments/:storyId', (req, res) => {
    const storyId = parseInt(req.params.storyId);
    const db = readDB();
    const comments = db.comments
        .filter(c => c.storyId === storyId)
        .map(comment => {
            const user = db.users.find(u => u.id === comment.userId);
            return { ...comment, user };
        });
    res.json({ comments });
});

app.post('/api/comments', (req, res) => {
    const { storyId, userId, content } = req.body;
    const db = readDB();
    const newComment = {
        id: Date.now(),
        storyId,
        userId,
        content,
        createdAt: new Date().toISOString()
    };
    db.comments.push(newComment);
    writeDB(db);
    res.json({ comment: newComment });
});

// User Stats
app.get('/api/users/:id/stats', (req, res) => {
    const userId = parseInt(req.params.id);
    const db = readDB();
    const stories = db.stories.filter(s => s.authorId === userId).length;
    const likes = db.likes.filter(l => l.userId === userId).length;
    const followers = db.follows.filter(f => f.followingId === userId).length;
    const following = db.follows.filter(f => f.followerId === userId).length;

    res.json({
        stats: {
            followers,
            following,
            stories
        }
    });
});

// User Stories
app.get('/api/stories/user/:id', (req, res) => {
    const userId = parseInt(req.params.id);
    const db = readDB();
    const stories = db.stories
        .filter(s => s.authorId === userId)
        .map(story => {
            const author = db.users.find(u => u.id === story.authorId);
            return { ...story, author };
        });
    res.json({ stories });
});

// Update Profile
app.post('/api/users/update', (req, res) => {
    const { id, username, bio, profilePic } = req.body;
    const db = readDB();
    const userIndex = db.users.findIndex(u => u.id === id);

    if (userIndex === -1) {
        return res.status(404).json({ message: "User not found" });
    }

    const existingUser = db.users.find(u => u.username === username && u.id !== id);
    if (existingUser) {
        return res.status(400).json({ message: "Username already taken" });
    }

    db.users[userIndex].username = username;
    db.users[userIndex].bio = bio;
    db.users[userIndex].profilePic = profilePic;

    writeDB(db);
    res.json({ user: db.users[userIndex] });
});

// Follow User
app.post('/api/users/follow', (req, res) => {
    const { followerId, followingId } = req.body;
    const db = readDB();

    if (followerId === followingId) {
        return res.status(400).json({ message: "You can't follow yourself." });
    }

    const followIndex = db.follows.findIndex(f =>
        f.followerId === followerId && f.followingId === followingId
    );

    if (followIndex > -1) {
        db.follows.splice(followIndex, 1);
    } else {
        db.follows.push({ followerId, followingId });
    }

    // Update stats
    db.users.forEach(user => {
        user.followers = db.follows.filter(f => f.followingId === user.id).length;
        user.following = db.follows.filter(f => f.followerId === user.id).length;
    });

    writeDB(db);
    res.json({ success: true });
});

// Check Follow Status
app.get('/api/users/check-follow/:userId/:followingId', (req, res) => {
    const { userId, followingId } = req.params;
    const db = readDB();
    const follows = db.follows.some(f => f.followerId == userId && f.followingId == followingId);
    res.json({ following: follows });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
