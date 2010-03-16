#include "INativeAddressCard.h"

class TaggedField 
{
	public:
		TaggedField(const char *type, const char *value);
		char *mType;
		char *mValue;
};

/* Header file */
class NativeAddressCard : public INativeAddressCard
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_INATIVEADDRESSCARD

  NativeAddressCard();


	void setFirstName(const char *name);
	void setLastName(const char *name);
	void setEmail(const char *type, const char *email);
	void setPhone(const char *type, const char *phone);
	void setURL(const char *type, const char *url);
private:
  ~NativeAddressCard();

protected:
  /* additional members */
	char *mFirstName;
	char *mLastName;
	
	TaggedField **mEmails;
	int mNumEmails, mEmailsSize;

	TaggedField **mPhones;
	int mNumPhones, mPhonesSize;

	TaggedField **mURLs;
	int mNumURLs, mURLsSize;
};
