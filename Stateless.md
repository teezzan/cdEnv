# Statelessness in web development

## Introduction.

The whole web development workflow can be simplified into a simple system of accepting data, storing data, processing data and returning processed data in appropriate forms. The system described is so general that almost any field in software engineering/development can fit into that template one way or the other. It is no news that since we need to store data, we need some form of persistent storage or database where the system can go to fetch properly aggregated data for the its consumption. There have been major breakthroughs in the database industry and its possible to get a sizeable amount of such storage for increasingly reducing cost. This trend will continue with improvement in the industry.

One metric that is common to any sort of database is the read and write speed. It has become relatively smaller than before. Due to historical reasons, it is a common thing while designing systems that make use of such storage mediums to reduce the amount of database access. This is because the time it takes to complete such operation adds up and is a major source of latency in many system. This is why caching is important. 

As a software developer with a electronics and electrical engineering background, I try as much as possible to reduce my disk accesses(writes mostly). This has led me to come up with certain implementation of popular/conventional things in my own special "stateless" style. By "stateless", I mean having very minimal or no use of database. In the previous months, I worked on few projects and will be enumerating my approach to some problems with my "stateless". Let me point  out before we get started that these implementations are not the best to use in anything serious. I simply used them while learning certain concepts and they worked fine for me. Please, let me know of the faults in my implementation. Learning must continue.

## User Registration

One of the most common feature of web application is user signin. It isnt very surprising since it is neccessary to be able to identify the user and appropriately deliver personalized value to them. There are various achitectures for engineering this particular feature and most of them require writing to the database. My greatest horror.

### Popular method of Implementation.

A very popular style of developing a user registration/sign-in is as follows. This style involves having the neccessary fields required from a user to be populated directly from the POST request handler. There is usually a field `verified` that keeps track of the verification status of the users email and/or phonenumber and a field `reset_token` and `reset_token_expires` to keep track of tokens generated for the purpose of user email verification and its expiry time. The Mongoose schema looks as shown below.
```javascript
    var UserSchema = new mongoose.Schema({

        name: String,
        email: { type: String, unique: true },
        username: { type: String, unique: true, default: `HM${randomint(1, 1000)}${randomint(1, 1000)}` },
        password: String,
        sub: Array,
        verified: { type: Boolean, default: true },
        blocked: { type: Boolean, default: false },
        resetToken: String,
        resetTokenExpires: { type: Date, default: Date.now() }

    });
```
This method is definately not my favorite and it was just natural for me to try another less-chunky method of user sign-up.

### My Stateless Approach
My approach was motivated by two things.
- The need to reduce database access.
- The need to verify my user's email once and for all without putting it up to the user to do that at a later time. My platform, my rules.

I needed a way to do all these in the simplest and very secured way possible. The steps required are as follows.

When a POST request for a user sign-up is gotten, extracted from the payload (parameters) are the neccecary information that are required in the user registration process. Neccessary input validation is carried out on the extracted information. For example, passwords can be hashed and one can check for the uniqeness of a email.  The extracted information is then packaged into a JSON, encoded and sent off to the email found in the payload(parameters). The encoded JSON is sent of in the form of a url that points back to the backend i.e it is attached to a special url endpoint as a query or parameter. This will require that there exist a special endpoint for capturing and processing this. To end the first stage, the user is asked to check their email for confirmation.

The second stage of the process is intiated when the user clicks on the "confirmation" url in the email. The GET request is processed and the encoded token is extracted from it. It is then decoded and a user is created from its content and everyone is happy. 

There are several things to point out at this point. The hashing is done by the JSON Web Token library. It is as secured as the JWT that is used in most systems today. It also contains several fields for ensuring that a stale token isn't allowed. These fields include the `nbf`, `exp` and `iat`. However, I opted to use a different secret in the encoding of the payload.

At the end, the implementation was fast, efficient and worth it (for me).

## Password Retrieval