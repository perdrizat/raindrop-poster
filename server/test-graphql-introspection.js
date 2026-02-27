import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function testBufferGraphQL() {
    try {
        const query = `
            query {
                __type(name: "ChannelsInput") {
                    inputFields {
                        name
                        type {
                            name
                            kind
                            ofType {
                                name
                                kind
                            }
                        }
                    }
                }
                mutationType: __schema {
                    mutationType {
                        fields {
                            name
                            args {
                                name
                                type {
                                    name
                                    kind
                                    ofType {
                                        name
                                        kind
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;

        const response = await axios.post('https://api.buffer.com/1/graphql', {
            query
        }, {
            headers: { 
                'Authorization': `Bearer ${process.env.BUFFER_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log("ChannelsInput:", JSON.stringify(response.data.data.__type, null, 2));
        const createIdeaField = response.data.data.mutationType.mutationType.fields.find(f => f.name === 'createIdea');
        console.log("createIdea args:", JSON.stringify(createIdeaField, null, 2));
    } catch (error) {
        console.error("Error Status:", error.response?.status);
        console.error("Error Data:", JSON.stringify(error.response?.data, null, 2));
    }
}
testBufferGraphQL();
