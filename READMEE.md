# cdEnv

## Securely store and access API tokens, passwords, encryption keys and other things as environment variables via CLI or HTTP API.

### The What

**cdEnv** is a self-hostable and secured system for storing keys and variables for different environments and projects. It allows easy access via HTTP API and CLI.


### The Why

Having various development environments on different platforms and you needing to update their keys and variables one by one could be a chore. **cdEnv** allows you to have complete control over your data and help serve it across the different environments, local or in the cloud.

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/teezzan/cdenv/blob/master/LICENSE)

## Screenshots/Demo

>Include logo, demo, screenshot etc.

## Built With

- [Nodejs](https://nodejs.org/en/)
- [MoleculerJS](https://moleculer.services/docs/0.14/)
- [MongoDB](https://www.mongodb.com/)

## Features

- Light-Weight
- User based Access
- Environment Based Access
- Data is Encrypted at Rest
- Works anywhere you have internet access.

## Example Code

The variables in an environment can be accessed as a `key:value` pair via an HTTP API request to the hosted app. A library was developed to do this and many more. It is as simple as 
```javascript
let cdenv = require('@teehazzan/cdenv');
cdenv.fetch('API-TOKEN-GENERATED-FROM-SERVER','APP-ENVIRONMENT-NAME');

```

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

### Prerequisites

>List which technologies the user needs to install the software and how to install these dependencies.

#### <Software Name>

>Links to resources and installation instructions. Include code examples. Break instructions down by operating system if necessary.

### Installation

>This section tells the user how to get a local environment running. Be sure to include specific step-by-step instructions for the installation process to accommodate coders of all levels.
>This section will vary greatly depending on the type of code the repository contains. For example, a Node package is usually installed by typing `npm install <package-name>` in the terminal, whereas other projects you may have to fork and clone down the repository. In both cases the user needs to have the requisite technology installed to run to code. Even with a Docker image, the user still needs to be able to run Docker on their machine.
>Keep this in mind when writing out the "Prerequisites" and "Installation" sections.

## API Reference/Documentation

>Depending on the size of the project, if it is small and simple enough the reference docs can be added to the `README`. For medium size to larger projects it is important to at least provide a link to where the API reference docs live.

## Tests

TBD

## Deployment

>Add additional notes about how to deploy this on a live system.

## Usage

>End with an example of getting some seed data out of the system or using it for a demo. Add screenshots, video links, and/or GIFs in this section to make your usage instructions as clear as possible to the user.

## Contributing

>Add more detailed instructions for open-source projects. It's a good idea to include a code of conduct as well as resource links as to where absolute beginners can go to learn how to contribute to open source. [Here's a great place to start.][Open Source Guides]
>I personally like the Contributor Covenant and use the below statement as my default. I intend to expand on it once I create an open-source project truly worthy of others' contributions.

Issues and pull requests are welcome at [<!-- repo title -->](<!-- link to repo -->). This project as well as all other content on my GitHub are intended to be safe, welcoming, and open for collaboration. Users are expected to adhere to the [Contributor Covenant code of conduct](https://www.contributor-covenant.org/version/2/0/code_of_conduct/). We are all human.

## Authors

>Include your name and any links to your social media, contact info, or websites that you'd like. Don't forget to s/o your contributors here too!

**[Taiwo Yusuf](https://github.com/teezzan/)**


## Acknowledgments

>- Hat tip to anyone whose code was used
>- Inspiration
>- Anything else that seems useful

## License
This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
