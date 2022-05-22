const express = require("express");
const { pool } = require("./dbConfig");
const bcrypt = require("bcrypt");
const passport = require("passport");
const flash = require("express-flash");
const session = require("express-session");
require("dotenv").config();
const app = express();

const PORT = process.env.PORT || 4000;

const initializePassport = require("./passportConfig");
const { is } = require("express/lib/request");

initializePassport(passport);

app.use('/assets',express.static('assets'));

app.use(express.urlencoded({ extended: false }));
app.set("view engine", "ejs");

app.use(
  session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

//GET METHODS

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/users/register", checkAuthenticated, (req, res) => {
  res.render("register.ejs");
});

app.get("/users/login", checkAuthenticated, (req, res) => {
  res.render("login.ejs");
});

app.get("/users/dashboard", checkNotAuthenticated, (req, res) => {
  console.log(req.isAuthenticated());
  pool.query(
    `SELECT * FROM todolist ORDER BY id`,
    (err, results) => {
      if (err) {
        throw err;
      }
      console.log(results.rows);
      res.render("dashboard.ejs", {list: results});
});
});

app.get("/users/addTodo", checkNotAuthenticated, (req, res) => {
  res.render("addTodo.ejs");
});

app.get("/users/edit/:id", checkNotAuthenticated, (req, res) =>{
  const id = req.params.id;
  pool.query(
    `SELECT * FROM todolist WHERE id = $1`,
    [id],
    (err, results) => {
      if (err) {
        throw err;
      }
      console.log(results.rows);
      res.render("edit.ejs", {list: results});
});
})

app.get("/users/view/:id", checkNotAuthenticated, (req, res) =>{
  const id = req.params.id;
  pool.query(
    `SELECT * FROM todolist
    INNER JOIN todoitems
    ON
    todolist.id = todoitems.item_id
    WHERE id = $1 ORDER BY item_no`,
    [id],
    (err, results) => {
      if (err) {
        throw err;
      }
      if(results.rows.length == 0){
        pool.query(
          `SELECT * FROM todolist WHERE id = $1`,
          [id],
          (err, results) =>{
            if(err){
              throw err;
            }else{
              res.render("view.ejs", {list: results});
            }
          }
        );
      }else{
        console.log(results.rows);
        res.render("view.ejs", {list: results});
      }
});
});

app.get("/users/addTodoItem/:id", checkNotAuthenticated, (req, res) => {
  const id = req.params.id;
  pool.query(
    `SELECT * FROM todolist WHERE id = $1`,
    [id],
    (err, results) => {
      if (err) {
        throw err;
      }
      console.log(results.rows);
      res.render("addTodoItem.ejs", {list: results});
});
});

app.get("/users/editItems/:item_no", checkNotAuthenticated, (req, res) =>{
  const item_no = req.params.item_no;
  pool.query(
    `SELECT * FROM todolist
    JOIN todoitems
    ON
    todolist.id = todoitems.item_id
    WHERE item_no = $1`,
    [item_no],
    (err, results) => {
      if (err) {
        throw err;
      }
      res.render("editItems.ejs", {items: results});
});
})

app.get("/users/logout", (req, res) => {
  req.logout(); 
  req.flash("success_msg", "You have logged out successfully!");
  res.redirect("/users/login");
});


//POST METHODS

app.post("/users/login", passport.authenticate("local", {
    successRedirect: "/users/dashboard",
    failureRedirect: "/users/login",
    failureFlash: true
  })
);

app.post("/users/register", async (req, res) => {
  let { name, email, password, password2 } = req.body;

  let errors = [];

  console.log({
    name,
    email,
    password,
    password2
  });

  if (!name || !email || !password || !password2) {
    errors.push({ message: "Please enter all fields!" });
  }

  if (password.length < 8) {
    errors.push({ message: "Password must be a least 8 characters long!" });
  }

  if (password !== password2) {
    errors.push({ message: "Passwords do not match!" });
  }

  if (errors.length > 0) {
    res.render("register", { errors, name, email, password, password2 });
  } else {
    hashedPassword = await bcrypt.hash(password, 10);
    console.log(hashedPassword);
    // Validation passed
    pool.query(
      `SELECT * FROM users
        WHERE email = $1`,
      [email],
      (err, results) => {
        if (err) {
          console.log(err);
        }
        console.log(results.rows);

        if (results.rows.length > 0) {
          return res.render("register", {
            message: "Email already registered!"
          });
        } else {
          pool.query(
            `INSERT INTO users (name, email, password)
                VALUES ($1, $2, $3)
                RETURNING id, password`,
            [name, email, hashedPassword],
            (err, results) => {
              if (err) {
                throw err;
              }
              console.log(results.rows);
              req.flash("success_msg", "Successfully Registered!");
              res.redirect("/users/login");
            }
          );
        }
      }
    );
  }
});

app.post("/users/addTodo", (req, res) => {
  let { title, description } = req.body;

  let errors = [];

  console.log({
    title,
    description
  });

  if (!title || !description) {
    errors.push({ message: "Please enter all fields!" });
  }

  if (errors.length > 0) {
    res.render("addTodo", { errors, title, description });
  } else {
    // Validation passed
    pool.query(
      `SELECT * FROM todolist
        WHERE title = $1`,
      [title],
      (err, results) => {
        if (err) {
          console.log(err);
        }
        console.log(results.rows);

        if (results.rows.length > 0) {
          return res.render("addTodo", {
            message: "Todo list already exists!"
          });
        } else {
          pool.query(
            `INSERT INTO todolist (title, description)
                VALUES ($1, $2)
                RETURNING id, user_id`,
            [title, description],
            (err, results) => {
              if (err) {
                throw err;
              }
              console.log(results.rows);
              req.flash("success_msg", "Todo List created successfully!");
              res.redirect("/users/dashboard");
            }
          );
        }
      }
    );
  }
});

app.post("/edit-list/:id", (req, res) => {
  let { title, description } = req.body;
  const id = req.params.id;
  pool.query(
    `UPDATE todolist SET title = $1, description = $2 WHERE id = $3`,
    [title, description, id],
    (err, results) => {
      if(err){
        throw err;
      }else{
        req.flash("success_msg", "Todo List updated successfully!");
        res.redirect("/users/dashboard");
      }
    }
  );
});

app.post("/delete-list/:id", (req, res) => {
  const id = req.params.id;
  pool.query(
    `DELETE FROM todolist WHERE id = $1`,
    [id],
    (err, results) => {
      if(err){
        throw err;
      }else{
        pool.query(
          `DELETE FROM todoitems WHERE item_id = $1`,
          [id],
          (err, results) => {
            if(err){
              throw err;
            }
          }
        );
        req.flash("success_msg", "Todo List deleted successfully!");
        res.redirect("/users/dashboard");
      }
    }
  );
});

app.post("/add-item/:id", (req, res) => {
  const id = req.params.id;
  let { item } = req.body;

  let errors = [];

  console.log({
    item
  });

  if (!item) {
    errors.push({ message: "Please enter the todo item!" });
  }

  if (errors.length > 0) {
    res.render("addTodo", { errors, item });
  } else {
    // Validation passed
    pool.query(
      `SELECT * FROM todoitems
        WHERE item = $1`,
      [item],
      (err, results) => {
        if (err) {
          console.log(err);
        }
        if (results.rows.length > 0) {
          return res.render("addTodoItem", {
            message: "Todo item already exists!"
          });
        } else {
          pool.query(
            `INSERT INTO todoitems (item, item_id)
                VALUES ($1, $2)`,
            [item, id],
            (err, results) => {
              if (err) {
                throw err;
              }
              req.flash("success_msg", "Todo Item created successfully!");
              res.redirect("/users/view/" + id);
            }
          );
        }
      }
    );
  }
});

app.post("/edit-item/:item_no", (req, res) => {
  let { item } = req.body;
  const item_no = req.params.item_no;
  pool.query(
    `UPDATE todoitems SET item = $1 WHERE item_no = $2`,
    [item, item_no],
    (err, results) => {
      if(err){
        throw err;
      }else{
        pool.query(
          `SELECT * from todolist join 
          todoitems
          ON id = item_id
          WHERE item_no =$1`,
          [item_no],
          (err, results) =>{
            if(err){
              throw err;
            }
            else{
              console.log("id by join is");
              const id = results.rows[0].id;
              console.log(id);
              req.flash("success_msg", "Todo Item updated successfully!");
              res.redirect("/users/view/" + id);
            }
          }
        );
        
      }
    }
  );
});

app.post("/delete-item/:item_no", (req, res) => {
  const item_no = req.params.item_no;
  pool.query(
    `SELECT * from todolist join 
    todoitems
    ON id = item_id
    WHERE item_no =$1`,
    [item_no],
    (err, results) => {
      if(err){
        throw err;
      }else{
        const id = results.rows[0].id;
        pool.query(
          `DELETE FROM todoitems WHERE item_no = $1`,
          [item_no],
          (err, results) =>{
            if(err){
              throw err;
            }
            else{
              req.flash("success_msg", "Todo Item deleted successfully!");
              res.redirect("/users/view/" + id);
            }
          }
        );
      }
    }
  );
});

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect("/users/dashboard");
  }
  next();
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/users/login");
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});